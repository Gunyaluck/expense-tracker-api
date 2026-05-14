import dotenv from 'dotenv';

process.env.NODE_ENV = 'test';

dotenv.config({ path: '.env.test' });
dotenv.config();

process.env.SESSION_SECRET ??= 'replace-with-a-long-random-secret-for-tests-123456';
process.env.SESSION_COOKIE_SECURE ??= 'false';
