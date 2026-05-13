import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import { cleanupTestUploads, createCategory, readCookie, resetTestDatabase } from './test-helpers';

let app: FastifyInstance;

async function registerAndAuthenticate() {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      displayName: 'Categories User',
      email: `categories-${randomUUID()}@example.com`,
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

test('creates and lists categories with kind filter', async () => {
  const cookie = await registerAndAuthenticate();

  const created = await createCategory({
    app,
    cookie,
    name: `Food ${randomUUID()}`,
    kind: 'expense',
  });

  const listed = await app.inject({
    method: 'GET',
    url: '/categories?page=1&pageSize=10&kind=expense&isActive=true',
    headers: { cookie },
  });

  assert.equal(listed.statusCode, 200, listed.body);

  const payload = listed.json();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].kind, 'expense');
  assert.equal(payload.meta.totalItems, 1);
});

test('rejects duplicate category name for the same kind', async () => {
  const cookie = await registerAndAuthenticate();
  const name = `Bills ${randomUUID()}`;

  const first = await app.inject({
    method: 'POST',
    url: '/categories',
    headers: { cookie },
    payload: {
      name,
      kind: 'expense',
    },
  });
  assert.equal(first.statusCode, 201, first.body);

  const second = await app.inject({
    method: 'POST',
    url: '/categories',
    headers: { cookie },
    payload: {
      name,
      kind: 'expense',
    },
  });

  assert.equal(second.statusCode, 409, second.body);
  assert.equal(second.json().message, 'Category name already exists for this type.');
});

test('deactivates a category instead of removing it permanently', async () => {
  const cookie = await registerAndAuthenticate();

  const created = await createCategory({
    app,
    cookie,
    name: `Bonus ${randomUUID()}`,
    kind: 'income',
  });

  const categoryId = created.id;
  const deleted = await app.inject({
    method: 'DELETE',
    url: `/categories/${categoryId}`,
    headers: { cookie },
  });

  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal(deleted.json().message, 'Category deactivated successfully.');

  const fetched = await app.inject({
    method: 'GET',
    url: `/categories/${categoryId}`,
    headers: { cookie },
  });

  assert.equal(fetched.statusCode, 200, fetched.body);
  assert.equal(fetched.json().item.isActive, false);
});
