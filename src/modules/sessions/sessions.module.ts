import type { FastifyPluginAsync } from 'fastify';

import { clearSessionCookie } from '../../common/auth/session.utils';
import { requireSession } from '../../common/auth/session.guard';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { validateRequestPart } from '../../common/validation/joi';
import { appDataSource } from '../../config/data-source';
import { SessionStatus } from '../../database/enums/session-status.enum';
import { SessionEntity } from '../../database/entities/session.entity';
import { listSessionsQuerySchema, revokeSessionParamsSchema } from './sessions.schemas';

export const registerSessionsModule: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    {
      preValidation: [requireSession, validateRequestPart(listSessionsQuerySchema, 'query')],
    },
    async (request) => {
      const { page, pageSize } = normalizePagination(
        request.query as { page?: number; pageSize?: 10 | 20 | 50 | 100 },
      );
      const sessionRepository = appDataSource.getRepository(SessionEntity);

      const [items, totalItems] = await sessionRepository.findAndCount({
        where: {
          userId: request.session!.userId,
        },
        order: {
          lastActivityAt: 'DESC',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return {
        items: items.map((session) => ({
          id: session.id,
          deviceId: session.deviceId,
          deviceName: session.deviceName,
          userAgent: session.userAgent,
          ipAddress: session.ipAddress,
          status: session.status,
          lastActivityAt: session.lastActivityAt,
          expiresAt: session.expiresAt,
          isCurrent: session.id === request.session!.sessionId,
        })),
        meta: buildPaginationMeta(totalItems, { page, pageSize }),
      };
    },
  );

  app.get(
    '/me',
    {
      preValidation: [requireSession],
    },
    async (request) => {
      const sessionRepository = appDataSource.getRepository(SessionEntity);
      const session = await sessionRepository.findOne({
        where: {
          id: request.session!.sessionId,
          userId: request.session!.userId,
        },
        relations: {
          user: true,
        },
      });

      if (!session) {
        return {
          session: null,
          user: null,
        };
      }

      return {
        session: {
          id: session.id,
          deviceId: session.deviceId,
          deviceName: session.deviceName,
          userAgent: session.userAgent,
          ipAddress: session.ipAddress,
          status: session.status,
          lastActivityAt: session.lastActivityAt,
          expiresAt: session.expiresAt,
        },
        user: {
          id: session.user.id,
          email: session.user.email,
          displayName: session.user.displayName,
          locale: session.user.locale,
        },
      };
    },
  );

  app.post(
    '/logout',
    {
      preValidation: [requireSession],
    },
    async (request, reply) => {
      const sessionRepository = appDataSource.getRepository(SessionEntity);

      await sessionRepository.update(
        {
          id: request.session!.sessionId,
          userId: request.session!.userId,
        },
        {
          status: SessionStatus.REVOKED,
          revokedAt: new Date(),
        },
      );

      clearSessionCookie(reply);

      return reply.send({
        message: 'Logged out successfully.',
      });
    },
  );

  app.post(
    '/logout-all',
    {
      preValidation: [requireSession],
    },
    async (request, reply) => {
      const sessionRepository = appDataSource.getRepository(SessionEntity);

      await sessionRepository
        .createQueryBuilder()
        .update(SessionEntity)
        .set({
          status: SessionStatus.REVOKED,
          revokedAt: new Date(),
        })
        .where('user_id = :userId', { userId: request.session!.userId })
        .andWhere('status = :status', { status: SessionStatus.ACTIVE })
        .execute();

      clearSessionCookie(reply);

      return reply.send({
        message: 'Logged out from all devices.',
      });
    },
  );

  app.delete(
    '/:sessionId',
    {
      preValidation: [requireSession, validateRequestPart(revokeSessionParamsSchema, 'params')],
    },
    async (request, reply) => {
      const params = request.params as { sessionId: string };
      const sessionRepository = appDataSource.getRepository(SessionEntity);

      const targetSession = await sessionRepository.findOne({
        where: {
          id: params.sessionId,
          userId: request.session!.userId,
        },
      });

      if (!targetSession) {
        return reply.code(404).send({
          message: 'Session not found.',
        });
      }

      targetSession.status = SessionStatus.REVOKED;
      targetSession.revokedAt = new Date();
      await sessionRepository.save(targetSession);

      if (targetSession.id === request.session!.sessionId) {
        clearSessionCookie(reply);
      }

      return reply.send({
        message: 'Session revoked successfully.',
      });
    },
  );
};
