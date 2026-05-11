import Joi from 'joi';

import { SESSION_PAGE_SIZES } from '../../common/auth/session.constants';
import { paginationQuerySchema } from '../../common/validation/joi';

export const listSessionsQuerySchema = paginationQuerySchema.keys({
  pageSize: Joi.number()
    .valid(...SESSION_PAGE_SIZES)
    .default(20),
});

export const revokeSessionParamsSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
});
