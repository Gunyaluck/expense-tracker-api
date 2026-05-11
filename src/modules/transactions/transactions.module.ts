import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { MultipartFile } from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';

import { requireSession } from '../../common/auth/session.guard';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { maskProfanity } from '../../common/utils/profanity';
import { validateRequestPart } from '../../common/validation/joi';
import { appDataSource } from '../../config/data-source';
import { env } from '../../config/env';
import { AccountEntity } from '../../database/entities/account.entity';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TransactionAttachmentEntity } from '../../database/entities/transaction-attachment.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import { TransactionType } from '../../database/enums/transaction-type.enum';
import {
  createTransactionBodySchema,
  listTransactionsQuerySchema,
  transactionAttachmentParamsSchema,
  transactionParamsSchema,
  updateTransactionBodySchema,
} from './transactions.schemas';

function toMoneyString(amount: number): string {
  return amount.toFixed(2);
}

function serializeAttachment(attachment: TransactionAttachmentEntity) {
  return {
    id: attachment.id,
    transactionId: attachment.transactionId,
    storageKey: attachment.storageKey,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    url: `/uploads/${attachment.storageKey}`,
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt,
  };
}

function serializeTransaction(transaction: TransactionEntity) {
  return {
    id: transaction.id,
    userId: transaction.userId,
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    type: transaction.type,
    amount: transaction.amount,
    occurredAt: transaction.occurredAt,
    note: transaction.noteSanitized,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    attachments: transaction.attachments?.map(serializeAttachment) ?? [],
    account: transaction.account
      ? {
          id: transaction.account.id,
          name: transaction.account.name,
          type: transaction.account.type,
          currencyCode: transaction.account.currencyCode,
          isActive: transaction.account.isActive,
        }
      : undefined,
    category: transaction.category
      ? {
          id: transaction.category.id,
          name: transaction.category.name,
          kind: transaction.category.kind,
          isActive: transaction.category.isActive,
        }
      : undefined,
  };
}

function normalizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function resolveUploadExtension(file: MultipartFile): string | null {
  const fromName = path.extname(file.filename).toLowerCase();

  if (fromName) {
    return fromName;
  }

  switch (file.mimetype) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return null;
  }
}

async function findOwnedTransaction(transactionId: string, userId: string) {
  return appDataSource.getRepository(TransactionEntity).findOne({
    where: {
      id: transactionId,
      userId,
    },
    relations: {
      account: true,
      category: true,
      attachments: true,
    },
  });
}

async function findOwnedAttachment(params: {
  transactionId: string;
  attachmentId: string;
  userId: string;
}) {
  return appDataSource
    .getRepository(TransactionAttachmentEntity)
    .createQueryBuilder('attachment')
    .innerJoinAndSelect('attachment.transaction', 'transaction')
    .where('attachment.id = :attachmentId', { attachmentId: params.attachmentId })
    .andWhere('attachment.transaction_id = :transactionId', { transactionId: params.transactionId })
    .andWhere('transaction.user_id = :userId', { userId: params.userId })
    .getOne();
}

async function resolveTransactionDependencies(params: {
  userId: string;
  accountId: string;
  categoryId: string;
  type: TransactionType;
}) {
  const accountRepository = appDataSource.getRepository(AccountEntity);
  const categoryRepository = appDataSource.getRepository(CategoryEntity);

  const [account, category] = await Promise.all([
    accountRepository.findOne({
      where: {
        id: params.accountId,
        userId: params.userId,
        isActive: true,
      },
    }),
    categoryRepository.findOne({
      where: {
        id: params.categoryId,
        userId: params.userId,
        isActive: true,
      },
    }),
  ]);

  if (!account) {
    return {
      error: {
        code: 400,
        message: 'Account not found or inactive.',
      },
    };
  }

  if (!category) {
    return {
      error: {
        code: 400,
        message: 'Category not found or inactive.',
      },
    };
  }

  if (String(category.kind) !== String(params.type)) {
    return {
      error: {
        code: 400,
        message: 'Category kind must match transaction type.',
      },
    };
  }

  return {
    account,
    category,
  };
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

      const transactionRepository = appDataSource.getRepository(TransactionEntity);
      const normalizedNote = payload.note?.trim() || null;
      const transaction = transactionRepository.create({
        userId: request.session!.userId,
        accountId: dependencies.account.id,
        categoryId: dependencies.category.id,
        type: payload.type,
        amount: toMoneyString(payload.amount),
        occurredAt: new Date(payload.occurredAt),
        note: normalizedNote,
        noteSanitized: maskProfanity(normalizedNote),
      });

      await transactionRepository.save(transaction);

      const savedTransaction = await transactionRepository.findOneOrFail({
        where: {
          id: transaction.id,
          userId: request.session!.userId,
        },
        relations: {
          account: true,
          category: true,
          attachments: true,
        },
      });

      return reply.code(201).send({
        item: serializeTransaction(savedTransaction),
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
      const transactionRepository = appDataSource.getRepository(TransactionEntity);
      const queryBuilder = transactionRepository
        .createQueryBuilder('transaction')
        .leftJoinAndSelect('transaction.account', 'account')
        .leftJoinAndSelect('transaction.category', 'category')
        .leftJoinAndSelect('transaction.attachments', 'attachments')
        .where('transaction.user_id = :userId', { userId: request.session!.userId });

      if (query.accountId) {
        queryBuilder.andWhere('transaction.account_id = :accountId', {
          accountId: query.accountId,
        });
      }

      if (query.categoryId) {
        queryBuilder.andWhere('transaction.category_id = :categoryId', {
          categoryId: query.categoryId,
        });
      }

      if (query.type) {
        queryBuilder.andWhere('transaction.type = :type', {
          type: query.type,
        });
      }

      if (query.year) {
        queryBuilder.andWhere('EXTRACT(YEAR FROM transaction.occurred_at) = :year', {
          year: query.year,
        });
      }

      if (query.month) {
        queryBuilder.andWhere('EXTRACT(MONTH FROM transaction.occurred_at) = :month', {
          month: query.month,
        });
      }

      if (query.fromDate) {
        queryBuilder.andWhere('transaction.occurred_at >= :fromDate', {
          fromDate: new Date(query.fromDate).toISOString(),
        });
      }

      if (query.toDate) {
        queryBuilder.andWhere('transaction.occurred_at <= :toDate', {
          toDate: new Date(query.toDate).toISOString(),
        });
      }

      const [items, totalItems] = await queryBuilder
        .orderBy('transaction.occurredAt', 'DESC')
        .addOrderBy('transaction.createdAt', 'DESC')
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount();

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
      const transactionRepository = appDataSource.getRepository(TransactionEntity);

      const transaction = await transactionRepository.findOne({
        where: {
          id: params.transactionId,
          userId: request.session!.userId,
        },
      });

      if (!transaction) {
        return reply.code(404).send({
          message: 'Transaction not found.',
        });
      }

      const nextType = payload.type ?? transaction.type;
      const nextAccountId = payload.accountId ?? transaction.accountId;
      const nextCategoryId = payload.categoryId ?? transaction.categoryId;

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

      transaction.accountId = dependencies.account.id;
      transaction.categoryId = dependencies.category.id;
      transaction.type = nextType;

      if (typeof payload.amount === 'number') {
        transaction.amount = toMoneyString(payload.amount);
      }

      if (payload.occurredAt) {
        transaction.occurredAt = new Date(payload.occurredAt);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'note')) {
        const normalizedNote = payload.note?.trim() || null;
        transaction.note = normalizedNote;
        transaction.noteSanitized = maskProfanity(normalizedNote);
      }

      await transactionRepository.save(transaction);

      const updatedTransaction = await transactionRepository.findOneOrFail({
        where: {
          id: transaction.id,
          userId: request.session!.userId,
        },
        relations: {
          account: true,
          category: true,
          attachments: true,
        },
      });

      return {
        item: serializeTransaction(updatedTransaction),
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

      const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

      if (!allowedMimeTypes.has(file.mimetype)) {
        return reply.code(400).send({
          message: 'Only JPEG, PNG, or WEBP slip images are allowed.',
        });
      }

      const extension = resolveUploadExtension(file);

      if (!extension) {
        return reply.code(400).send({
          message: 'Could not determine file extension for upload.',
        });
      }

      const originalFilename = normalizeFilename(file.filename || `slip${extension}`);
      const storageKey = path.posix.join(
        'transactions',
        transaction.id,
        `${randomUUID()}${extension}`,
      );
      const absolutePath = path.join(env.UPLOAD_DIR, ...storageKey.split('/'));

      await mkdir(path.dirname(absolutePath), { recursive: true });
      await pipeline(file.file, createWriteStream(absolutePath));

      const attachmentRepository = appDataSource.getRepository(TransactionAttachmentEntity);
      const attachment = attachmentRepository.create({
        transactionId: transaction.id,
        storageKey,
        originalFilename,
        mimeType: file.mimetype,
        fileSize: Number(file.file.bytesRead),
      });

      await attachmentRepository.save(attachment);

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

      const absolutePath = path.join(env.UPLOAD_DIR, ...attachment.storageKey.split('/'));

      await rm(absolutePath, { force: true });
      await appDataSource.getRepository(TransactionAttachmentEntity).remove(attachment);

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
      const transactionRepository = appDataSource.getRepository(TransactionEntity);

      const transaction = await transactionRepository.findOne({
        where: {
          id: params.transactionId,
          userId: request.session!.userId,
        },
      });

      if (!transaction) {
        return reply.code(404).send({
          message: 'Transaction not found.',
        });
      }

      await transactionRepository.remove(transaction);

      return {
        message: 'Transaction deleted successfully.',
      };
    },
  );
};
