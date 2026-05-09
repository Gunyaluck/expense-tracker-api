import 'fastify';

import type { SessionContext } from '../auth/session.types';

declare module 'fastify' {
  interface FastifyRequest {
    session?: SessionContext;
  }
}
