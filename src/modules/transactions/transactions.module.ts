import type { FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import Joi from 'joi';

import { requireSession } from '../../common/auth/session.guard';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { maskProfanity } from '../../common/utils/profanity';
import { validateRequestPart } from '../../common/validation/joi';
import { TransactionType } from '../../database/enums/transaction-type.enum';
import {
  createTransactionBodySchema,
  importedTransactionSchema,
  importTransactionsQuerySchema,
  listTransactionsQuerySchema,
  transactionAttachmentParamsSchema,
  transactionParamsSchema,
  updateTransactionBodySchema,
} from './transactions.schemas';
import { serializeAttachment, serializeTransaction } from './transactions.serializers';
import {
  isAllowedAttachmentMimeType,
  removeStoredAttachment,
  storeTransactionAttachment,
} from './transaction-attachments.storage';
import {
  createAttachmentRecord,
  createTransactionRecord,
  findOwnedAttachment,
  findOwnedTransaction,
  listTransactions,
  removeAttachmentRecord,
  removeTransactionRecord,
  resolveTransactionDependencies,
  updateTransactionRecord,
} from './transactions.repository';

type ImportFormat = 'json' | 'csv' | 'excel' | 'googleSheet';
type ImportedTransaction = {
  accountId: string;
  categoryId: string;
  type: TransactionType;
  amount: number;
  occurredAt: string;
  note?: string | null;
};

function normalizeImportRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    accountId: row.accountId,
    categoryId: row.categoryId,
    type: row.type,
    amount: typeof row.amount === 'string' ? Number(row.amount) : row.amount,
    occurredAt: row.occurredAt,
    note: row.note ?? null,
  };
}

async function parseImportFile(buffer: Buffer, format: ImportFormat): Promise<unknown[]> {
  if (format === 'json') {
    const parsed = JSON.parse(buffer.toString('utf8')) as unknown;

    return Array.isArray(parsed) ? parsed : (parsed as { items?: unknown[] }).items ?? [];
  }

  if (format === 'csv' || format === 'googleSheet') {
    return parse(buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as unknown[];
  }

  const workbook = new ExcelJS.Workbook();
  const excelBuffer = Buffer.from(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(excelBuffer);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return [];
  }

  const headerRow = worksheet.getRow(1);
  const headers = headerRow.values as Array<string | undefined>;
  const rows: Record<string, unknown>[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const item: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      if (header) {
        item[String(header)] = row.getCell(index).value;
      }
    });
    rows.push(item);
  });

  return rows;
}

export const registerTransactionsModule: FastifyPluginAsync = async (app) => {
  app.post(
    '/',
    {
      preValidation: [requireSession, validateRequestPart(createTransactionBodySchema, 'body')],
    },
    async (request, reply) => {
      const payload = request.body as {
        accountId: string;
        categoryId: string;
        type: TransactionType;
        amount: number;
        occurredAt: string;
        note?: string | null;
      };
      const dependencies = await resolveTransactionDependencies({
        userId: request.session!.userId,
        accountId: payload.accountId,
        categoryId: payload.categoryId,
        type: payload.type,
      });

      if ('error' in dependencies) {
        return reply.code(dependencies.error.code).send({
          message: dependencies.error.message,
        });
      }

      const normalizedNote = payload.note?.trim() || null;
      const transaction = await createTransactionRecord({
        userId: request.session!.userId,
        accountId: dependencies.account.id,
        categoryId: dependencies.category.id,
        type: payload.type,
        amount: payload.amount,
        occurredAt: payload.occurredAt,
        note: normalizedNote,
        noteSanitized: maskProfanity(normalizedNote),
      });

      return reply.code(201).send({
        item: transaction ? serializeTransaction(transaction) : undefined,
      });
    },
  );

  app.post(
    '/import',
    {
      preValidation: [requireSession, validateRequestPart(importTransactionsQuerySchema, 'query')],
    },
    async (request, reply) => {
      const query = request.query as { format: ImportFormat };
      const file = await request.file();

      if (!file) {
        return reply.code(400).send({
          message: 'Import file is required.',
        });
      }

      let rows: unknown[];

      try {
        rows = await parseImportFile(await file.toBuffer(), query.format);
      } catch {
        return reply.code(400).send({
          message: 'Could not parse import file.',
        });
      }

      const arraySchema = Joi.array().items(importedTransactionSchema).min(1);
      const normalizedRows = rows.map((row) => normalizeImportRow(row as Record<string, unknown>));
      const { error, value } = arraySchema.validate(normalizedRows, {
        abortEarly: false,
        convert: true,
        stripUnknown: true,
      });

      if (error) {
        return reply.code(400).send({
          message: 'Validation failed.',
          details: error.details.map((detail) => ({
            message: detail.message,
            path: detail.path.join('.'),
            type: detail.type,
          })),
        });
      }

      const created = [];
      const errors = [];

      for (const [index, payload] of (value as ImportedTransaction[]).entries()) {
        const dependencies = await resolveTransactionDependencies({
          userId: request.session!.userId,
          accountId: payload.accountId,
          categoryId: payload.categoryId,
          type: payload.type,
        });

        if ('error' in dependencies) {
          errors.push({
            row: index + 1,
            message: dependencies.error.message,
          });
          continue;
        }

        const normalizedNote = payload.note?.trim() || null;
        const transaction = await createTransactionRecord({
          userId: request.session!.userId,
          accountId: dependencies.account.id,
          categoryId: dependencies.category.id,
          type: payload.type,
          amount: payload.amount,
          occurredAt: payload.occurredAt,
          note: normalizedNote,
          noteSanitized: maskProfanity(normalizedNote),
        });

        if (transaction) {
          created.push(serializeTransaction(transaction));
        }
      }

      return reply.code(errors.length > 0 ? 207 : 201).send({
        importedCount: created.length,
        failedCount: errors.length,
        items: created,
        errors,
      });
    },
  );

  app.get(
    '/',
    {
      preValidation: [requireSession, validateRequestPart(listTransactionsQuerySchema, 'query')],
    },
    async (request) => {
      const query = request.query as {
        page?: number;
        pageSize?: 10 | 20 | 50 | 100;
        month?: number;
        year?: number;
        categoryId?: string;
        accountId?: string;
        type?: TransactionType;
        fromDate?: string;
        toDate?: string;
      };
      const { page, pageSize } = normalizePagination(query);
      const [items, totalItems] = await listTransactions({
        userId: request.session!.userId,
        page,
        pageSize,
        month: query.month,
        year: query.year,
        categoryId: query.categoryId,
        accountId: query.accountId,
        type: query.type,
        fromDate: query.fromDate,
        toDate: query.toDate,
      });

      return {
        items: items.map(serializeTransaction),
        meta: buildPaginationMeta(totalItems, { page, pageSize }),
      };
    },
  );

  app.get(
    '/:transactionId',
    {
      preValidation: [requireSession, validateRequestPart(transactionParamsSchema, 'params')],
    },
    async (request, reply) => {
      const params = request.params as { transactionId: string };
      const transaction = await findOwnedTransaction(params.transactionId, request.session!.userId);

      if (!transaction) {
        return reply.code(404).send({
          message: 'Transaction not found.',
        });
      }

      return {
        item: serializeTransaction(transaction),
      };
    },
  );

  app.patch(
    '/:transactionId',
    {
      preValidation: [
        requireSession,
        validateRequestPart(transactionParamsSchema, 'params'),
        validateRequestPart(updateTransactionBodySchema, 'body'),
      ],
    },
    async (request, reply) => {
      const params = request.params as { transactionId: string };
      const payload = request.body as {
        accountId?: string;
        categoryId?: string;
        type?: TransactionType;
        amount?: number;
        occurredAt?: string;
        note?: string | null;
      };
      const existingTransaction = await findOwnedTransaction(
        params.transactionId,
        request.session!.userId,
      );

      if (!existingTransaction) {
        return reply.code(404).send({
          message: 'Transaction not found.',
        });
      }

      const nextType = payload.type ?? existingTransaction.type;
      const nextAccountId = payload.accountId ?? existingTransaction.accountId;
      const nextCategoryId = payload.categoryId ?? existingTransaction.categoryId;
      const dependencies = await resolveTransactionDependencies({
        userId: request.session!.userId,
        accountId: nextAccountId,
        categoryId: nextCategoryId,
        type: nextType,
      });

      if ('error' in dependencies) {
        return reply.code(dependencies.error.code).send({
          message: dependencies.error.message,
        });
      }

      const normalizedNote = payload.note?.trim() || null;
      const updatedTransaction = await updateTransactionRecord({
        transactionId: params.transactionId,
        userId: request.session!.userId,
        accountId: dependencies.account.id,
        categoryId: dependencies.category.id,
        type: nextType,
        amount: payload.amount,
        occurredAt: payload.occurredAt,
        noteIncluded: Object.prototype.hasOwnProperty.call(payload, 'note'),
        note: normalizedNote,
        noteSanitized: maskProfanity(normalizedNote),
      });

      return {
        item: updatedTransaction ? serializeTransaction(updatedTransaction) : undefined,
      };
    },
  );

  app.post(
    '/:transactionId/attachments',
    {
      preValidation: [requireSession, validateRequestPart(transactionParamsSchema, 'params')],
    },
    async (request, reply) => {
      const params = request.params as { transactionId: string };
      const transaction = await findOwnedTransaction(params.transactionId, request.session!.userId);

      if (!transaction) {
        return reply.code(404).send({
          message: 'Transaction not found.',
        });
      }

      const file = await request.file();

      if (!file) {
        return reply.code(400).send({
          message: 'Attachment file is required.',
        });
      }

      if (!isAllowedAttachmentMimeType(file.mimetype)) {
        return reply.code(400).send({
          message: 'Only JPEG, PNG, or WEBP slip images are allowed.',
        });
      }

      const storedFile = await storeTransactionAttachment({
        file,
        transactionId: transaction.id,
      });

      if (!storedFile) {
        return reply.code(400).send({
          message: 'Could not determine file extension for upload.',
        });
      }

      const attachment = await createAttachmentRecord({
        transactionId: transaction.id,
        storageKey: storedFile.storageKey,
        originalFilename: storedFile.originalFilename,
        mimeType: file.mimetype,
        fileSize: storedFile.fileSize,
      });
      const updatedTransaction = await findOwnedTransaction(transaction.id, request.session!.userId);

      return reply.code(201).send({
        item: serializeAttachment(attachment),
        transaction: updatedTransaction ? serializeTransaction(updatedTransaction) : undefined,
      });
    },
  );

  app.delete(
    '/:transactionId/attachments/:attachmentId',
    {
      preValidation: [
        requireSession,
        validateRequestPart(transactionAttachmentParamsSchema, 'params'),
      ],
    },
    async (request, reply) => {
      const params = request.params as { transactionId: string; attachmentId: string };
      const attachment = await findOwnedAttachment({
        transactionId: params.transactionId,
        attachmentId: params.attachmentId,
        userId: request.session!.userId,
      });

      if (!attachment) {
        return reply.code(404).send({
          message: 'Transaction attachment not found.',
        });
      }

      await removeStoredAttachment(attachment.storageKey);
      await removeAttachmentRecord(attachment);

      const updatedTransaction = await findOwnedTransaction(
        params.transactionId,
        request.session!.userId,
      );

      return {
        message: 'Transaction attachment deleted successfully.',
        transaction: updatedTransaction ? serializeTransaction(updatedTransaction) : undefined,
      };
    },
  );

  app.delete(
    '/:transactionId',
    {
      preValidation: [requireSession, validateRequestPart(transactionParamsSchema, 'params')],
    },
    async (request, reply) => {
      const params = request.params as { transactionId: string };
      const deleted = await removeTransactionRecord({
        transactionId: params.transactionId,
        userId: request.session!.userId,
      });

      if (!deleted) {
        return reply.code(404).send({
          message: 'Transaction not found.',
        });
      }

      return {
        message: 'Transaction deleted successfully.',
      };
    },
  );
};
