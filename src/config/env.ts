import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().default('0.0.0.0'),
  DATABASE_URL: Joi.string().uri().required(),
  UPLOAD_DIR: Joi.string().default('uploads'),
  SESSION_SECRET: Joi.string().min(32).required(),
  SESSION_COOKIE_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  DEFAULT_USER_LOCALE: Joi.string().valid('en', 'th').default('th'),
}).unknown();

const { error, value } = envSchema.validate(process.env, {
  abortEarly: false,
  convert: true,
});

if (error) {
  throw new Error(`Invalid environment configuration: ${error.message}`);
}

export const env = value;
