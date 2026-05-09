import Joi from 'joi';

export const registerBodySchema = Joi.object({
  displayName: Joi.string().min(2).max(120).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
});

export const loginBodySchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  deviceName: Joi.string().max(120).optional(),
});
