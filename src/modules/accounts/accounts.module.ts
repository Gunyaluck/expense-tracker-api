import type { FastifyPluginAsync } from 'fastify';

import { requireSession } from '../../common/auth/session.guard';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { validateRequestPart } from '../../common/validation/joi';
import { appDataSource } from '../../config/data-source';
import { AccountEntity } from '../../database/entities/account.entity';
import {
  accountParamsSchema,
  createAccountBodySchema,
  listAccountsQuerySchema,
  updateAccountBodySchema,
} from './accounts.schemas';

export const registerAccountsModule: FastifyPluginAsync = async (app) => {
  app.post(
    '/',
    {
      preValidation: [requireSession, validateRequestPart(createAccountBodySchema, 'body')],
    },
    async (request, reply) => {
      const payload = request.body as {
        name: string;
        type: AccountEntity['type'];
        currencyCode: string;
      };
      const accountRepository = appDataSource.getRepository(AccountEntity);
      const normalizedName = payload.name.trim();

      const existingAccount = await accountRepository.findOne({
        where: {
          userId: request.session!.userId,
          name: normalizedName,
        },
      });

      if (existingAccount) {
        return reply.code(409).send({
          message: 'Account name already exists.',
        });
      }

      const account = accountRepository.create({
        userId: request.session!.userId,
        name: normalizedName,
        type: payload.type,
        currencyCode: payload.currencyCode,
        isActive: true,
      });

      await accountRepository.save(account);

      return reply.code(201).send({
        item: account,
      });
    },
  );

  app.get(
    '/',
    {
      preValidation: [requireSession, validateRequestPart(listAccountsQuerySchema, 'query')],
    },
    async (request) => {
      const query = request.query as {
        page?: number;
        pageSize?: 10 | 20 | 50 | 100;
        isActive?: boolean;
      };
      const { page, pageSize } = normalizePagination(query);
      const accountRepository = appDataSource.getRepository(AccountEntity);
      const queryBuilder = accountRepository
        .createQueryBuilder('account')
        .where('account.user_id = :userId', { userId: request.session!.userId });

      if (typeof query.isActive === 'boolean') {
        queryBuilder.andWhere('account.is_active = :isActive', {
          isActive: query.isActive,
        });
      }

      const [items, totalItems] = await queryBuilder
        .orderBy('account.created_at', 'DESC')
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount();

      return {
        items,
        meta: buildPaginationMeta(totalItems, { page, pageSize }),
      };
    },
  );

  app.get(
    '/:accountId',
    {
      preValidation: [requireSession, validateRequestPart(accountParamsSchema, 'params')],
    },
    async (request, reply) => {
      const params = request.params as { accountId: string };
      const accountRepository = appDataSource.getRepository(AccountEntity);

      const account = await accountRepository.findOne({
        where: {
          id: params.accountId,
          userId: request.session!.userId,
        },
      });

      if (!account) {
        return reply.code(404).send({
          message: 'Account not found.',
        });
      }

      return {
        item: account,
      };
    },
  );

  app.patch(
    '/:accountId',
    {
      preValidation: [
        requireSession,
        validateRequestPart(accountParamsSchema, 'params'),
        validateRequestPart(updateAccountBodySchema, 'body'),
      ],
    },
    async (request, reply) => {
      const params = request.params as { accountId: string };
      const payload = request.body as {
        name?: string;
        type?: AccountEntity['type'];
        currencyCode?: string;
        isActive?: boolean;
      };
      const accountRepository = appDataSource.getRepository(AccountEntity);

      const account = await accountRepository.findOne({
        where: {
          id: params.accountId,
          userId: request.session!.userId,
        },
      });

      if (!account) {
        return reply.code(404).send({
          message: 'Account not found.',
        });
      }

      if (payload.name && payload.name.trim() !== account.name) {
        const duplicate = await accountRepository.findOne({
          where: {
            userId: request.session!.userId,
            name: payload.name.trim(),
          },
        });

        if (duplicate && duplicate.id !== account.id) {
          return reply.code(409).send({
            message: 'Account name already exists.',
          });
        }

        account.name = payload.name.trim();
      }

      if (payload.type) {
        account.type = payload.type;
      }

      if (payload.currencyCode) {
        account.currencyCode = payload.currencyCode;
      }

      if (typeof payload.isActive === 'boolean') {
        account.isActive = payload.isActive;
      }

      await accountRepository.save(account);

      return {
        item: account,
      };
    },
  );

  app.delete(
    '/:accountId',
    {
      preValidation: [requireSession, validateRequestPart(accountParamsSchema, 'params')],
    },
    async (request, reply) => {
      const params = request.params as { accountId: string };
      const accountRepository = appDataSource.getRepository(AccountEntity);

      const account = await accountRepository.findOne({
        where: {
          id: params.accountId,
          userId: request.session!.userId,
        },
      });

      if (!account) {
        return reply.code(404).send({
          message: 'Account not found.',
        });
      }

      account.isActive = false;
      await accountRepository.save(account);

      return {
        message: 'Account deactivated successfully.',
      };
    },
  );
};
