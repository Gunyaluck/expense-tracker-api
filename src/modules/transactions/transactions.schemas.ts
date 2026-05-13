import Joi from 'joi';

import { paginationQuerySchema } from '../../common/validation/joi';

export const createTransactionBodySchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  categoryId: Joi.string().uuid().required(),
  type: Joi.string().valid('income', 'expense').required(),
  amount: Joi.number().positive().precision(2).required(),
  occurredAt: Joi.date().iso().required(),
  note: Joi.string().max(500).allow('', null).optional(),
});

export const updateTransactionBodySchema = Joi.object({
  accountId: Joi.string().uuid().optional(),
  categoryId: Joi.string().uuid().optional(),
  type: Joi.string().valid('income', 'expense').optional(),
  amount: Joi.number().positive().precision(2).optional(),
  occurredAt: Joi.date().iso().optional(),
  note: Joi.string().max(500).allow('', null).optional(),
})
  .min(1)
  .required();

export const listTransactionsQuerySchema = paginationQuerySchema.keys({
  month: Joi.number().integer().min(1).max(12).optional(),
  year: Joi.number().integer().min(2000).max(2100).optional(),
  categoryId: Joi.string().uuid().optional(),
  accountId: Joi.string().uuid().optional(),
  type: Joi.string().valid('income', 'expense').optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().min(Joi.ref('fromDate')).optional(),
});

export const transactionParamsSchema = Joi.object({
  transactionId: Joi.string().uuid().required(),
});

export const transactionAttachmentParamsSchema = Joi.object({
  transactionId: Joi.string().uuid().required(),
  attachmentId: Joi.string().uuid().required(),
});
