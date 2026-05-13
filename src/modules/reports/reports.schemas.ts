import Joi from 'joi';

export const summaryQuerySchema = Joi.object({
  groupBy: Joi.string().valid('day', 'month', 'year').required(),
  month: Joi.number().integer().min(1).max(12).optional(),
  year: Joi.number().integer().min(2000).max(2100).optional(),
  categoryId: Joi.string().uuid().optional(),
  accountId: Joi.string().uuid().optional(),
  type: Joi.string().valid('income', 'expense').optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().min(Joi.ref('fromDate')).optional(),
});
