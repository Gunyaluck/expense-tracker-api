import type { FastifyRequest } from 'fastify';
import Joi, { type ObjectSchema } from 'joi';

export type RequestPart = 'body' | 'query' | 'params';
export const PAGE_SIZES = [10, 20, 50, 100] as const;
export interface RequestValidationError extends Error {
  statusCode: number;
  validation: Joi.ValidationError;
}

export function validateRequestPart<T>(schema: ObjectSchema<T>, part: RequestPart) {
  return async (request: FastifyRequest): Promise<void> => {
    const payload = request[part] as T;
    const { error, value } = schema.validate(payload, {
      abortEarly: false,
      convert: true,
      stripUnknown: true,
    });

    if (error) {
      const validationError = new Error(error.message) as RequestValidationError;
      validationError.statusCode = 400;
      validationError.validation = error;

      throw validationError;
    }

    request[part] = value;
  };
}

export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number()
    .valid(...PAGE_SIZES)
    .default(20),
});

export function formatJoiError(error: Joi.ValidationError) {
  return {
    message: 'Validation failed.',
    details: error.details.map((detail) => ({
      message: detail.message,
      path: detail.path.join('.'),
      type: detail.type,
    })),
  };
}
