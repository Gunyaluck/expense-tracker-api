import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import { cleanupTestUploads, resetTestDatabase } from './test-helpers';

let app: FastifyInstance;

before(async () => {
  app = await buildApp();
  await app.ready();
});

beforeEach(async () => {
  await resetTestDatabase();
});

after(async () => {
  if (app) {
    await app.close();
  }

  await cleanupTestUploads();
});

test('registers a user and creates a session cookie', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      displayName: 'Auth User',
      email: `auth-${randomUUID()}@example.com`,
      password: 'Password123',
    },
  });

  assert.equal(response.statusCode, 201, response.body);

  const payload = response.json();
  assert.equal(payload.user.displayName, 'Auth User');
  assert.equal(typeof payload.user.id, 'string');
  assert.equal(typeof payload.session.id, 'string');
  assert.ok(response.headers['set-cookie']);
});

test('rejects duplicate email registration', async () => {
  const email = `dup-${randomUUID()}@example.com`;

  const first = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      displayName: 'First User',
      email,
      password: 'Password123',
    },
  });
  assert.equal(first.statusCode, 201, first.body);

  const second = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      displayName: 'Second User',
      email,
      password: 'Password123',
    },
  });

  assert.equal(second.statusCode, 409, second.body);
  assert.equal(second.json().message, 'Email is already registered.');
});

test('logs in with valid credentials and rejects invalid password', async () => {
  const email = `login-${randomUUID()}@example.com`;
  const password = 'Password123';

  const registered = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      displayName: 'Login User',
      email,
      password,
    },
  });
  assert.equal(registered.statusCode, 201, registered.body);

  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email,
      password,
      deviceName: 'Test Device',
    },
  });

  assert.equal(login.statusCode, 200, login.body);
  assert.equal(login.json().user.email, email);
  assert.ok(login.headers['set-cookie']);

  const invalidLogin = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email,
      password: 'WrongPass123',
    },
  });

  assert.equal(invalidLogin.statusCode, 401, invalidLogin.body);
  assert.equal(invalidLogin.json().message, 'Invalid email or password.');
});
