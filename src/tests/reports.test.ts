import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import { cleanupTestUploads, createAccount, createCategory, createTransaction, registerAndAuthenticate, resetTestDatabase } from './test-helpers';

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

test('returns grouped report summary with totals and filters', async () => {
  const { cookie } = await registerAndAuthenticate({ app, displayName: 'Report User' });
  const cashAccount = await createAccount({ app, cookie, name: `Cash ${randomUUID()}` });
  const bankAccount = await createAccount({ app, cookie, name: `Bank ${randomUUID()}` });
  const expenseCategory = await createCategory({ app, cookie, name: `Food ${randomUUID()}`, kind: 'expense' });
  const incomeCategory = await createCategory({ app, cookie, name: `Salary ${randomUUID()}`, kind: 'income' });

  await createTransaction({
    app,
    cookie,
    accountId: cashAccount.id,
    categoryId: expenseCategory.id,
    type: 'expense',
    amount: 80,
    occurredAt: '2026-05-10T10:00:00.000Z',
    note: 'groceries',
  });
  await createTransaction({
    app,
    cookie,
    accountId: cashAccount.id,
    categoryId: expenseCategory.id,
    type: 'expense',
    amount: 20,
    occurredAt: '2026-05-10T12:00:00.000Z',
    note: 'coffee',
  });
  await createTransaction({
    app,
    cookie,
    accountId: cashAccount.id,
    categoryId: expenseCategory.id,
    type: 'expense',
    amount: 120,
    occurredAt: '2026-05-11T10:00:00.000Z',
    note: 'transport',
  });
  await createTransaction({
    app,
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
  const { cookie } = await registerAndAuthenticate({ app, displayName: 'Report User' });
  const account = await createAccount({ app, cookie, name: `Primary ${randomUUID()}` });
  const expenseCategory = await createCategory({ app, cookie, name: `Bills ${randomUUID()}`, kind: 'expense' });
  const incomeCategory = await createCategory({ app, cookie, name: `Bonus ${randomUUID()}`, kind: 'income' });

  await createTransaction({
    app,
    cookie,
    accountId: account.id,
    categoryId: expenseCategory.id,
    type: 'expense',
    amount: 300,
    occurredAt: '2026-01-05T10:00:00.000Z',
  });
  await createTransaction({
    app,
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
