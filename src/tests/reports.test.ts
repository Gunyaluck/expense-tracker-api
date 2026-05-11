import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import { env } from '../config/env';
import { appDataSource } from '../config/data-source';

let app: FastifyInstance;

function readCookie(setCookieHeader: string | string[] | undefined): string {
  const rawCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

  assert.ok(rawCookie, 'Expected session cookie in response headers.');

  const cookie = rawCookie.split(';', 1)[0];
  assert.ok(cookie, 'Expected a serialized cookie value.');

  return cookie;
}

async function registerAndAuthenticate() {
  const email = `test-${randomUUID()}@example.com`;
  const password = 'Password123';
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      displayName: 'Report User',
      email,
      password,
    },
  });

  assert.equal(response.statusCode, 201, response.body);

  return {
    cookie: readCookie(response.headers['set-cookie']),
  };
}

async function createAccount(cookie: string, name: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/accounts',
    headers: { cookie },
    payload: {
      name,
      type: 'cash',
      currencyCode: 'THB',
    },
  });

  assert.equal(response.statusCode, 201, response.body);

  return response.json().item as { id: string };
}

async function createCategory(cookie: string, name: string, kind: 'income' | 'expense') {
  const response = await app.inject({
    method: 'POST',
    url: '/categories',
    headers: { cookie },
    payload: { name, kind },
  });

  assert.equal(response.statusCode, 201, response.body);

  return response.json().item as { id: string };
}

async function createTransaction(params: {
  cookie: string;
  accountId: string;
  categoryId: string;
  type: 'income' | 'expense';
  amount: number;
  occurredAt: string;
  note?: string;
}) {
  const response = await app.inject({
    method: 'POST',
    url: '/transactions',
    headers: { cookie: params.cookie },
    payload: {
      accountId: params.accountId,
      categoryId: params.categoryId,
      type: params.type,
      amount: params.amount,
      occurredAt: params.occurredAt,
      note: params.note,
    },
  });

  assert.equal(response.statusCode, 201, response.body);
}

before(async () => {
  app = await buildApp();
  await app.ready();
});

beforeEach(async () => {
  if (!appDataSource.isInitialized) {
    await appDataSource.initialize();
  }

  await appDataSource.synchronize(true);
});

after(async () => {
  if (app) {
    await app.close();
  }

  await rm(env.UPLOAD_DIR, { recursive: true, force: true });
});

test('returns grouped report summary with totals and filters', async () => {
  const { cookie } = await registerAndAuthenticate();
  const cashAccount = await createAccount(cookie, `Cash ${randomUUID()}`);
  const bankAccount = await createAccount(cookie, `Bank ${randomUUID()}`);
  const expenseCategory = await createCategory(cookie, `Food ${randomUUID()}`, 'expense');
  const incomeCategory = await createCategory(cookie, `Salary ${randomUUID()}`, 'income');

  await createTransaction({
    cookie,
    accountId: cashAccount.id,
    categoryId: expenseCategory.id,
    type: 'expense',
    amount: 80,
    occurredAt: '2026-05-10T10:00:00.000Z',
    note: 'groceries',
  });
  await createTransaction({
    cookie,
    accountId: cashAccount.id,
    categoryId: expenseCategory.id,
    type: 'expense',
    amount: 20,
    occurredAt: '2026-05-10T12:00:00.000Z',
    note: 'coffee',
  });
  await createTransaction({
    cookie,
    accountId: cashAccount.id,
    categoryId: expenseCategory.id,
    type: 'expense',
    amount: 120,
    occurredAt: '2026-05-11T10:00:00.000Z',
    note: 'transport',
  });
  await createTransaction({
    cookie,
    accountId: bankAccount.id,
    categoryId: incomeCategory.id,
    type: 'income',
    amount: 1500,
    occurredAt: '2026-05-11T15:00:00.000Z',
    note: 'salary',
  });

  const response = await app.inject({
    method: 'GET',
    url: `/reports/summary?groupBy=day&month=5&year=2026&accountId=${cashAccount.id}`,
    headers: { cookie },
  });

  assert.equal(response.statusCode, 200, response.body);

  const payload = response.json();
  assert.equal(payload.groupBy, 'day');
  assert.equal(payload.filters.month, 5);
  assert.equal(payload.filters.year, 2026);
  assert.equal(payload.filters.accountId, cashAccount.id);
  assert.equal(payload.totals.incomeTotal, '0.00');
  assert.equal(payload.totals.expenseTotal, '220.00');
  assert.equal(payload.totals.netTotal, '-220.00');
  assert.equal(payload.totals.transactionCount, 3);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].period, '2026-05-10');
  assert.equal(payload.items[0].expenseTotal, '100.00');
  assert.equal(payload.items[0].transactionCount, 2);
  assert.equal(payload.items[1].period, '2026-05-11');
  assert.equal(payload.items[1].expenseTotal, '120.00');
  assert.equal(payload.items[1].transactionCount, 1);
});

test('supports report summary filtered by transaction type', async () => {
  const { cookie } = await registerAndAuthenticate();
  const account = await createAccount(cookie, `Primary ${randomUUID()}`);
  const expenseCategory = await createCategory(cookie, `Bills ${randomUUID()}`, 'expense');
  const incomeCategory = await createCategory(cookie, `Bonus ${randomUUID()}`, 'income');

  await createTransaction({
    cookie,
    accountId: account.id,
    categoryId: expenseCategory.id,
    type: 'expense',
    amount: 300,
    occurredAt: '2026-01-05T10:00:00.000Z',
  });
  await createTransaction({
    cookie,
    accountId: account.id,
    categoryId: incomeCategory.id,
    type: 'income',
    amount: 2000,
    occurredAt: '2026-02-05T10:00:00.000Z',
  });

  const response = await app.inject({
    method: 'GET',
    url: '/reports/summary?groupBy=month&year=2026&type=income',
    headers: { cookie },
  });

  assert.equal(response.statusCode, 200, response.body);

  const payload = response.json();
  assert.equal(payload.totals.incomeTotal, '2000.00');
  assert.equal(payload.totals.expenseTotal, '0.00');
  assert.equal(payload.totals.netTotal, '2000.00');
  assert.equal(payload.totals.transactionCount, 1);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].period, '2026-02');
});
