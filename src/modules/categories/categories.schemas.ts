import Joi from 'joi';

import { paginationQuerySchema } from '../../common/validation/joi';

export const createCategoryBodySchema = Joi.object({
  name: Joi.string().max(120).required(),
  kind: Joi.string().valid('income', 'expense').required(),
});

export const listCategoriesQuerySchema = paginationQuerySchema.keys({
  kind: Joi.string().valid('income', 'expense').optional(),
  isActive: Joi.boolean().optional(),
});
