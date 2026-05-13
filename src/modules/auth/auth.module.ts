import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';
import type { FastifyPluginAsync } from 'fastify';

import { createSessionToken, setSessionCookie } from '../../common/auth/session.utils';
import { validateRequestPart } from '../../common/validation/joi';
import { appDataSource } from '../../config/data-source';
import { env } from '../../config/env';
import { Locale } from '../../database/enums/locale.enum';
import { SessionStatus } from '../../database/enums/session-status.enum';
import { SessionEntity } from '../../database/entities/session.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { loginBodySchema, registerBodySchema } from './auth.schemas';

export const registerAuthModule: FastifyPluginAsync = async (app) => {
  app.post(
    '/register',
    {
      preValidation: [validateRequestPart(registerBodySchema, 'body')],
    },
    async (request, reply) => {
      const payload = request.body as {
        displayName: string;
        email: string;
        password: string;
      };

      const userRepository = appDataSource.getRepository(UserEntity);
      const sessionRepository = appDataSource.getRepository(SessionEntity);

      const existingUser = await userRepository.findOne({
        where: { email: payload.email.toLowerCase() },
      });

      if (existingUser) {
        return reply.code(409).send({
          message: 'Email is already registered.',
        });
      }

      const passwordHash = await bcrypt.hash(payload.password, 12);
      const user = userRepository.create({
        displayName: payload.displayName,
        email: payload.email.toLowerCase(),
        passwordHash,
        locale: env.DEFAULT_USER_LOCALE as Locale,
      });

      await userRepository.save(user);

      const token = createSessionToken();
      const session = sessionRepository.create({
        userId: user.id,
        tokenHash: token.tokenHash,
        deviceId: randomUUID(),
        deviceName: 'Initial session',
        userAgent: request.headers['user-agent'] ?? null,
        ipAddress: request.ip,
        status: SessionStatus.ACTIVE,
        lastActivityAt: new Date(),
        expiresAt: token.expiresAt,
        revokedAt: null,
      });

      await sessionRepository.save(session);
      setSessionCookie(reply, token.rawToken, token.expiresAt);

      return reply.code(201).send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          locale: user.locale,
        },
        session: {
          id: session.id,
          deviceId: session.deviceId,
          expiresAt: session.expiresAt,
        },
      });
    },
  );

  app.post(
    '/login',
    {
      preValidation: [validateRequestPart(loginBodySchema, 'body')],
    },
    async (request, reply) => {
      const payload = request.body as {
        email: string;
        password: string;
        deviceName?: string;
      };

      const userRepository = appDataSource.getRepository(UserEntity);
      const sessionRepository = appDataSource.getRepository(SessionEntity);

      const user = await userRepository.findOne({
        where: { email: payload.email.toLowerCase() },
      });

      if (!user) {
        return reply.code(401).send({
          message: 'Invalid email or password.',
        });
      }

      const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);

      if (!passwordMatches) {
        return reply.code(401).send({
          message: 'Invalid email or password.',
        });
      }

      const token = createSessionToken();
      const session = sessionRepository.create({
        userId: user.id,
        tokenHash: token.tokenHash,
        deviceId: randomUUID(),
        deviceName: payload.deviceName ?? null,
        userAgent: request.headers['user-agent'] ?? null,
        ipAddress: request.ip,
        status: SessionStatus.ACTIVE,
        lastActivityAt: new Date(),
        expiresAt: token.expiresAt,
        revokedAt: null,
      });

      await sessionRepository.save(session);
      setSessionCookie(reply, token.rawToken, token.expiresAt);

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          locale: user.locale,
        },
        session: {
          id: session.id,
          deviceId: session.deviceId,
          expiresAt: session.expiresAt,
        },
      });
    },
  );
};
