import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import ExcelJS from 'exceljs';
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

test('exports report summary as csv and excel', async () => {
  const { cookie } = await registerAndAuthenticate({ app, displayName: 'Export User' });
  const account = await createAccount({ app, cookie, name: `Export ${randomUUID()}` });
  const category = await createCategory({ app, cookie, name: `Meals ${randomUUID()}`, kind: 'expense' });

  await createTransaction({
    app,
    cookie,
    accountId: account.id,
    categoryId: category.id,
    type: 'expense',
    amount: 75,
    occurredAt: '2026-05-12T10:00:00.000Z',
  });

  const csvResponse = await app.inject({
    method: 'GET',
    url: '/reports/summary/export?groupBy=day&month=5&year=2026&format=csv',
    headers: { cookie },
  });

  assert.equal(csvResponse.statusCode, 200, csvResponse.body);
  assert.match(csvResponse.headers['content-type'] as string, /text\/csv/);
  assert.match(csvResponse.body, /period,incomeTotal,expenseTotal,netTotal,transactionCount/);
  assert.match(csvResponse.body, /2026-05-12,0.00,75.00,-75.00,1/);

  const excelResponse = await app.inject({
    method: 'GET',
    url: '/reports/summary/export?groupBy=day&month=5&year=2026&format=excel',
    headers: { cookie },
  });

  assert.equal(excelResponse.statusCode, 200, excelResponse.body);
  assert.match(
    excelResponse.headers['content-type'] as string,
    /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
  );

  const workbook = new ExcelJS.Workbook();
  const excelBuffer = Buffer.from(excelResponse.rawPayload) as unknown as Parameters<
    typeof workbook.xlsx.load
  >[0];
  await workbook.xlsx.load(excelBuffer);
  const worksheet = workbook.getWorksheet('Summary');

  assert.ok(worksheet);
  assert.equal(worksheet.getCell('A2').value, '2026-05-12');
  assert.equal(worksheet.getCell('C2').value, '75.00');
});

test('stores monthly budget and returns daily allowance', async () => {
  const { cookie } = await registerAndAuthenticate({ app, displayName: 'Budget User' });
  const account = await createAccount({ app, cookie, name: `Budget ${randomUUID()}` });
  const expenseCategory = await createCategory({ app, cookie, name: `Food ${randomUUID()}`, kind: 'expense' });
  const incomeCategory = await createCategory({ app, cookie, name: `Salary ${randomUUID()}`, kind: 'income' });

  await createTransaction({
    app,
    cookie,
    accountId: account.id,
    categoryId: incomeCategory.id,
    type: 'income',
    amount: 500,
    occurredAt: '2026-05-01T10:00:00.000Z',
  });
  await createTransaction({
    app,
    cookie,
    accountId: account.id,
    categoryId: expenseCategory.id,
    type: 'expense',
    amount: 300,
    occurredAt: '2026-05-10T10:00:00.000Z',
  });

  const budgetResponse = await app.inject({
    method: 'PUT',
    url: '/reports/monthly-budget',
    headers: { cookie },
    payload: {
      year: 2026,
      month: 5,
      plannedExpenseLimit: 400,
    },
  });

  assert.equal(budgetResponse.statusCode, 200, budgetResponse.body);
  assert.equal(budgetResponse.json().item.plannedExpenseLimit, '400.00');

  const remainingResponse = await app.inject({
    method: 'GET',
    url: '/reports/daily-allowance?year=2026&month=5&asOfDate=2026-05-22T00:00:00.000Z&basis=remaining',
    headers: { cookie },
  });

  assert.equal(remainingResponse.statusCode, 200, remainingResponse.body);
  assert.equal(remainingResponse.json().daysRemaining, 10);
  assert.equal(remainingResponse.json().remainingTotal, '200.00');
  assert.equal(remainingResponse.json().dailyAllowance, '20.00');

  const budgetAllowanceResponse = await app.inject({
    method: 'GET',
    url: '/reports/daily-allowance?year=2026&month=5&asOfDate=2026-05-22T00:00:00.000Z&basis=budget',
    headers: { cookie },
  });

  assert.equal(budgetAllowanceResponse.statusCode, 200, budgetAllowanceResponse.body);
  assert.equal(budgetAllowanceResponse.json().budgetRemaining, '100.00');
  assert.equal(budgetAllowanceResponse.json().dailyAllowance, '10.00');
});
