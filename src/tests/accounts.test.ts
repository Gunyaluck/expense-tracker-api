import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import { cleanupTestUploads, createAccount, readCookie, resetTestDatabase } from './test-helpers';

let app: FastifyInstance;

async function registerAndAuthenticate() {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      displayName: 'Accounts User',
      email: `accounts-${randomUUID()}@example.com`,
      password: 'Password123',
    },
  });

  assert.equal(response.statusCode, 201, response.body);

  return readCookie(response.headers['set-cookie']);
}

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

test('creates and lists accounts with pagination metadata', async () => {
  const cookie = await registerAndAuthenticate();

  const created = await createAccount({
    app,
    cookie,
    name: `Cash ${randomUUID()}`,
    type: 'cash',
  });

  const listed = await app.inject({
    method: 'GET',
    url: '/accounts?page=1&pageSize=10&isActive=true',
    headers: { cookie },
  });

  assert.equal(listed.statusCode, 200, listed.body);

  const payload = listed.json();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].type, 'cash');
  assert.equal(payload.meta.totalItems, 1);
  assert.equal(payload.meta.pageSize, 10);
});

test('rejects duplicate account name for the same user', async () => {
  const cookie = await registerAndAuthenticate();
  const name = `Wallet ${randomUUID()}`;

  const first = await app.inject({
    method: 'POST',
    url: '/accounts',
    headers: { cookie },
    payload: {
      name,
      type: 'ewallet',
      currencyCode: 'THB',
    },
  });
  assert.equal(first.statusCode, 201, first.body);

  const second = await app.inject({
    method: 'POST',
    url: '/accounts',
    headers: { cookie },
    payload: {
      name,
      type: 'bank',
      currencyCode: 'THB',
    },
  });

  assert.equal(second.statusCode, 409, second.body);
  assert.equal(second.json().message, 'Account name already exists.');
});

test('deactivates an account instead of removing it permanently', async () => {
  const cookie = await registerAndAuthenticate();

  const created = await createAccount({
    app,
    cookie,
    name: `Card ${randomUUID()}`,
    type: 'credit_card',
  });

  const accountId = created.id;
  const deleted = await app.inject({
    method: 'DELETE',
    url: `/accounts/${accountId}`,
    headers: { cookie },
  });

  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal(deleted.json().message, 'Account deactivated successfully.');

  const fetched = await app.inject({
    method: 'GET',
    url: `/accounts/${accountId}`,
    headers: { cookie },
  });

  assert.equal(fetched.statusCode, 200, fetched.body);
  assert.equal(fetched.json().item.isActive, false);
});
