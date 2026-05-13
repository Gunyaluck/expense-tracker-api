import type { FastifyPluginAsync } from 'fastify';

import { requireSession } from '../../common/auth/session.guard';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { validateRequestPart } from '../../common/validation/joi';
import { appDataSource } from '../../config/data-source';
import { CategoryEntity } from '../../database/entities/category.entity';
import {
  categoryParamsSchema,
  createCategoryBodySchema,
  listCategoriesQuerySchema,
  updateCategoryBodySchema,
} from './categories.schemas';

export const registerCategoriesModule: FastifyPluginAsync = async (app) => {
  app.post(
    '/',
    {
      preValidation: [requireSession, validateRequestPart(createCategoryBodySchema, 'body')],
    },
    async (request, reply) => {
      const payload = request.body as {
        name: string;
        kind: CategoryEntity['kind'];
      };
      const categoryRepository = appDataSource.getRepository(CategoryEntity);
      const normalizedName = payload.name.trim();

      const existingCategory = await categoryRepository.findOne({
        where: {
          userId: request.session!.userId,
          name: normalizedName,
          kind: payload.kind,
        },
      });

      if (existingCategory) {
        return reply.code(409).send({
          message: 'Category name already exists for this type.',
        });
      }

      const category = categoryRepository.create({
        userId: request.session!.userId,
        name: normalizedName,
        kind: payload.kind,
        isActive: true,
      });

      await categoryRepository.save(category);

      return reply.code(201).send({
        item: category,
      });
    },
  );

  app.get(
    '/',
    {
      preValidation: [requireSession, validateRequestPart(listCategoriesQuerySchema, 'query')],
    },
    async (request) => {
      const query = request.query as {
        page?: number;
        pageSize?: 10 | 20 | 50 | 100;
        kind?: CategoryEntity['kind'];
        isActive?: boolean;
      };
      const { page, pageSize } = normalizePagination(query);
      const categoryRepository = appDataSource.getRepository(CategoryEntity);
      const queryBuilder = categoryRepository
        .createQueryBuilder('category')
        .where('category.user_id = :userId', { userId: request.session!.userId });

      if (query.kind) {
        queryBuilder.andWhere('category.kind = :kind', { kind: query.kind });
      }

      if (typeof query.isActive === 'boolean') {
        queryBuilder.andWhere('category.is_active = :isActive', {
          isActive: query.isActive,
        });
      }

      const [items, totalItems] = await queryBuilder
        .orderBy('category.created_at', 'DESC')
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
    '/:categoryId',
    {
      preValidation: [requireSession, validateRequestPart(categoryParamsSchema, 'params')],
    },
    async (request, reply) => {
      const params = request.params as { categoryId: string };
      const categoryRepository = appDataSource.getRepository(CategoryEntity);

      const category = await categoryRepository.findOne({
        where: {
          id: params.categoryId,
          userId: request.session!.userId,
        },
      });

      if (!category) {
        return reply.code(404).send({
          message: 'Category not found.',
        });
      }

      return {
        item: category,
      };
    },
  );

  app.patch(
    '/:categoryId',
    {
      preValidation: [
        requireSession,
        validateRequestPart(categoryParamsSchema, 'params'),
        validateRequestPart(updateCategoryBodySchema, 'body'),
      ],
    },
    async (request, reply) => {
      const params = request.params as { categoryId: string };
      const payload = request.body as {
        name?: string;
        kind?: CategoryEntity['kind'];
        isActive?: boolean;
      };
      const categoryRepository = appDataSource.getRepository(CategoryEntity);

      const category = await categoryRepository.findOne({
        where: {
          id: params.categoryId,
          userId: request.session!.userId,
        },
      });

      if (!category) {
        return reply.code(404).send({
          message: 'Category not found.',
        });
      }

      const nextName = payload.name ? payload.name.trim() : category.name;
      const nextKind = payload.kind ?? category.kind;

      if (nextName !== category.name || nextKind !== category.kind) {
        const duplicate = await categoryRepository.findOne({
          where: {
            userId: request.session!.userId,
            name: nextName,
            kind: nextKind,
          },
        });

        if (duplicate && duplicate.id !== category.id) {
          return reply.code(409).send({
            message: 'Category name already exists for this type.',
          });
        }
      }

      category.name = nextName;
      category.kind = nextKind;

      if (typeof payload.isActive === 'boolean') {
        category.isActive = payload.isActive;
      }

      await categoryRepository.save(category);

      return {
        item: category,
      };
    },
  );

  app.delete(
    '/:categoryId',
    {
      preValidation: [requireSession, validateRequestPart(categoryParamsSchema, 'params')],
    },
    async (request, reply) => {
      const params = request.params as { categoryId: string };
      const categoryRepository = appDataSource.getRepository(CategoryEntity);

      const category = await categoryRepository.findOne({
        where: {
          id: params.categoryId,
          userId: request.session!.userId,
        },
      });

      if (!category) {
        return reply.code(404).send({
          message: 'Category not found.',
        });
      }

      category.isActive = false;
      await categoryRepository.save(category);

      return {
        message: 'Category deactivated successfully.',
      };
    },
  );
};
