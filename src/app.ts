import 'reflect-metadata';

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastify, { type FastifyInstance } from 'fastify';
import Joi from 'joi';

import { registerDatabasePlugin } from './common/database/database.plugin';
import { formatJoiError } from './common/validation/joi';
import { env } from './config/env';
import { registerModules } from './modules';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: env.NODE_ENV !== 'test',
  });
  const uploadRoot = path.resolve(env.UPLOAD_DIR);

  app.get('/health', async () => ({
    status: 'ok',
  }));

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
  await mkdir(uploadRoot, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadRoot,
    prefix: '/uploads/',
  });

  await app.register(registerDatabasePlugin);
  await registerModules(app);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Joi.ValidationError) {
      return reply.code(400).send(formatJoiError(error));
    }

    return reply.send(error);
  });

  return app;
}
