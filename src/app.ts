import 'reflect-metadata';

import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastify, { type FastifyInstance } from 'fastify';

import { env } from './config/env';
import { registerModules } from './modules';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: env.NODE_ENV !== 'test',
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      files: 5,
      fileSize: 10 * 1024 * 1024,
    },
  });

  await registerModules(app);

  return app;
}
