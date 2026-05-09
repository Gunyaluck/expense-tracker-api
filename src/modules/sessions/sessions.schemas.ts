import Joi from 'joi';

import { paginationQuerySchema } from '../../common/validation/joi';

export const listSessionsQuerySchema = paginationQuerySchema;

export const revokeSessionParamsSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
});
