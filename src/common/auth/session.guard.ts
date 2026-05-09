import type { FastifyReply, FastifyRequest } from 'fastify';
import { IsNull, MoreThan } from 'typeorm';

import { appDataSource } from '../../config/data-source';
import { SessionStatus } from '../../database/enums/session-status.enum';
import { SessionEntity } from '../../database/entities/session.entity';
import { getSessionIdleExpiry, getSessionTokenFromRequest, hashSessionToken } from './session.utils';

export async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const rawToken = getSessionTokenFromRequest(request);

  if (!rawToken) {
    await reply.code(401).send({
      message: 'Authentication required.',
    });

    return;
  }

  const sessionRepository = appDataSource.getRepository(SessionEntity);
  const tokenHash = hashSessionToken(rawToken);

  const session = await sessionRepository.findOne({
    where: {
      tokenHash,
      status: SessionStatus.ACTIVE,
      revokedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    },
  });

  if (!session) {
    await reply.code(401).send({
      message: 'Invalid or expired session.',
    });

    return;
  }

  session.lastActivityAt = new Date();
  session.expiresAt = getSessionIdleExpiry();
  await sessionRepository.save(session);

  request.session = {
    sessionId: session.id,
    userId: session.userId,
    deviceId: session.deviceId,
  };
}
