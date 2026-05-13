import Joi from 'joi';

export const summaryFiltersSchema = {
  groupBy: Joi.string().valid('day', 'month', 'year').required(),
  month: Joi.number().integer().min(1).max(12).optional(),
  year: Joi.number().integer().min(2000).max(2100).optional(),
  categoryId: Joi.string().uuid().optional(),
  accountId: Joi.string().uuid().optional(),
  type: Joi.string().valid('income', 'expense').optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().min(Joi.ref('fromDate')).optional(),
};

export const summaryQuerySchema = Joi.object(summaryFiltersSchema);

export const summaryExportQuerySchema = Joi.object({
  ...summaryFiltersSchema,
  format: Joi.string().valid('json', 'csv', 'excel', 'googleSheet').default('json'),
});

export const monthlyBudgetBodySchema = Joi.object({
  year: Joi.number().integer().min(2000).max(2100).required(),
  month: Joi.number().integer().min(1).max(12).required(),
  plannedExpenseLimit: Joi.number().min(0).precision(2).required(),
});

export const dailyAllowanceQuerySchema = Joi.object({
  year: Joi.number().integer().min(2000).max(2100).required(),
  month: Joi.number().integer().min(1).max(12).required(),
  asOfDate: Joi.date().iso().optional(),
  basis: Joi.string().valid('remaining', 'budget').default('remaining'),
});
