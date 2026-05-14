import Joi from 'joi';

import { paginationQuerySchema } from '../../common/validation/joi';

export const createAccountBodySchema = Joi.object({
  name: Joi.string().max(120).required(),
  type: Joi.string().valid('cash', 'bank', 'ewallet', 'credit_card', 'other').required(),
  currencyCode: Joi.string().length(3).uppercase().default('THB'),
});

export const updateAccountBodySchema = Joi.object({
  name: Joi.string().max(120).optional(),
  type: Joi.string().valid('cash', 'bank', 'ewallet', 'credit_card', 'other').optional(),
  currencyCode: Joi.string().length(3).uppercase().optional(),
  isActive: Joi.boolean().optional(),
})
  .min(1)
  .required();

export const listAccountsQuerySchema = paginationQuerySchema.keys({
  isActive: Joi.boolean().optional(),
});

export const accountParamsSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
});
