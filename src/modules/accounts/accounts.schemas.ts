import Joi from 'joi';

import { paginationQuerySchema } from '../../common/validation/joi';

export const createAccountBodySchema = Joi.object({
  name: Joi.string().max(120).required(),
  type: Joi.string().valid('cash', 'bank', 'ewallet', 'credit_card', 'other').required(),
  currencyCode: Joi.string().length(3).uppercase().default('THB'),
});

export const listAccountsQuerySchema = paginationQuerySchema.keys({
  isActive: Joi.boolean().optional(),
});
