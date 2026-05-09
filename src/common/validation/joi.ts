import type { FastifyRequest } from 'fastify';
import Joi, { type ObjectSchema } from 'joi';

export type RequestPart = 'body' | 'query' | 'params';

export function validateRequestPart<T>(schema: ObjectSchema<T>, part: RequestPart) {
  return async (request: FastifyRequest): Promise<void> => {
    const payload = request[part] as T;
    const { error, value } = schema.validate(payload, {
      abortEarly: false,
      convert: true,
      stripUnknown: true,
    });

    if (error) {
      throw error;
    }

    request[part] = value;
  };
}

export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().valid(10, 20, 50, 100).default(20),
});
