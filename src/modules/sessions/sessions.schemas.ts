import Joi from 'joi';

import { paginationQuerySchema, PAGE_SIZES } from '../../common/validation/joi';

export const listSessionsQuerySchema = paginationQuerySchema.keys({
  pageSize: Joi.number()
    .valid(...PAGE_SIZES)
    .default(20),
});

export const revokeSessionParamsSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
});
