import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import { cleanupTestUploads, createAccount, createCategory, createTransaction, registerAndAuthenticate, resetTestDatabase, uploadAttachment } from './test-helpers';

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

test('creates a transaction and returns a sanitized note', async () => {
  const { cookie } = await registerAndAuthenticate({ app });
  const account = await createAccount({ app, cookie });
  const category = await createCategory({ app, cookie, kind: 'expense' });

  const response = await createTransaction({
    app,
    cookie,
    accountId: account.id,
    categoryId: category.id,
    note: 'shit happened',
  });

  assert.equal(response.statusCode, 201, response.body);

  const payload = response.json();
  assert.equal(payload.item.accountId, account.id);
  assert.equal(payload.item.categoryId, category.id);
  assert.equal(payload.item.type, 'expense');
  assert.equal(payload.item.note, '*** happened');
  assert.equal(payload.item.account.id, account.id);
  assert.equal(payload.item.category.id, category.id);
});

test('lists transactions with filters and pagination metadata', async () => {
  const { cookie } = await registerAndAuthenticate({ app });
  const cashAccount = await createAccount({ app, cookie });
  const bankAccount = await createAccount({ app, cookie });
  const expenseCategory = await createCategory({ app, cookie, kind: 'expense' });
  const incomeCategory = await createCategory({ app, cookie, kind: 'income' });

  const createdOne = await createTransaction({
    app,
    cookie,
    accountId: cashAccount.id,
    categoryId: expenseCategory.id,
    amount: 80,
    occurredAt: '2026-05-10T10:00:00.000Z',
    note: 'groceries',
  });
  assert.equal(createdOne.statusCode, 201, createdOne.body);

  const createdTwo = await createTransaction({
    app,
    cookie,
    accountId: cashAccount.id,
    categoryId: expenseCategory.id,
    amount: 120,
    occurredAt: '2026-05-11T10:00:00.000Z',
    note: 'transport',
  });
  assert.equal(createdTwo.statusCode, 201, createdTwo.body);

  const createdThree = await createTransaction({
    app,
    cookie,
    accountId: bankAccount.id,
    categoryId: incomeCategory.id,
    type: 'income',
    amount: 1500,
    occurredAt: '2026-04-05T10:00:00.000Z',
    note: 'salary',
  });
  assert.equal(createdThree.statusCode, 201, createdThree.body);

  const response = await app.inject({
    method: 'GET',
    url: `/transactions?page=1&pageSize=1&month=5&year=2026&accountId=${cashAccount.id}&categoryId=${expenseCategory.id}&type=expense`,
    headers: {
      cookie,
    },
  });

  assert.equal(response.statusCode, 200, response.body);

  const payload = response.json();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].accountId, cashAccount.id);
  assert.equal(payload.items[0].categoryId, expenseCategory.id);
  assert.equal(payload.items[0].type, 'expense');
  assert.equal(payload.meta.page, 1);
  assert.equal(payload.meta.pageSize, 1);
  assert.equal(payload.meta.totalItems, 2);
  assert.equal(payload.meta.totalPages, 2);
  assert.equal(payload.meta.hasNextPage, true);
  assert.equal(payload.meta.hasPreviousPage, false);
});

test('updates a transaction and re-masks note content', async () => {
  const { cookie } = await registerAndAuthenticate({ app });
  const account = await createAccount({ app, cookie });
  const oldCategory = await createCategory({ app, cookie, kind: 'expense' });
  const newCategory = await createCategory({ app, cookie, kind: 'expense' });

  const created = await createTransaction({
    app,
    cookie,
    accountId: account.id,
    categoryId: oldCategory.id,
    amount: 55,
    note: 'coffee',
  });

  assert.equal(created.statusCode, 201, created.body);

  const transactionId = created.json().item.id as string;
  const updated = await app.inject({
    method: 'PATCH',
    url: `/transactions/${transactionId}`,
    headers: {
      cookie,
    },
    payload: {
      categoryId: newCategory.id,
      amount: 99.99,
      note: 'เหี้ย มาก',
    },
  });

  assert.equal(updated.statusCode, 200, updated.body);

  const payload = updated.json();
  assert.equal(payload.item.categoryId, newCategory.id);
  assert.equal(payload.item.amount, '99.99');
  assert.equal(payload.item.note, '*** มาก');
});

test('deletes a transaction and returns not found afterward', async () => {
  const { cookie } = await registerAndAuthenticate({ app });
  const account = await createAccount({ app, cookie });
  const category = await createCategory({ app, cookie, kind: 'expense' });

  const created = await createTransaction({
    app,
    cookie,
    accountId: account.id,
    categoryId: category.id,
    note: 'temporary',
  });

  assert.equal(created.statusCode, 201, created.body);

  const transactionId = created.json().item.id as string;
  const deleted = await app.inject({
    method: 'DELETE',
    url: `/transactions/${transactionId}`,
    headers: {
      cookie,
    },
  });

  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal(deleted.json().message, 'Transaction deleted successfully.');

  const fetched = await app.inject({
    method: 'GET',
    url: `/transactions/${transactionId}`,
    headers: {
      cookie,
    },
  });

  assert.equal(fetched.statusCode, 404, fetched.body);
  assert.equal(fetched.json().message, 'Transaction not found.');
});

test('rejects create when category kind does not match transaction type', async () => {
  const { cookie } = await registerAndAuthenticate({ app });
  const account = await createAccount({ app, cookie });
  const incomeCategory = await createCategory({ app, cookie, kind: 'income' });

  const response = await createTransaction({
    app,
    cookie,
    accountId: account.id,
    categoryId: incomeCategory.id,
    type: 'expense',
    note: 'invalid mapping',
  });

  assert.equal(response.statusCode, 400, response.body);
  assert.equal(response.json().message, 'Category kind must match transaction type.');
});

test('uploads a transaction slip image and returns attachment metadata', async () => {
  const { cookie } = await registerAndAuthenticate({ app });
  const account = await createAccount({ app, cookie });
  const category = await createCategory({ app, cookie, kind: 'expense' });
  const created = await createTransaction({
    app,
    cookie,
    accountId: account.id,
    categoryId: category.id,
    note: 'with slip',
  });

  assert.equal(created.statusCode, 201, created.body);

  const transactionId = created.json().item.id as string;
  const response = await uploadAttachment({ app, cookie, transactionId });

  assert.equal(response.statusCode, 201, response.body);

  const payload = response.json();
  assert.equal(payload.item.transactionId, transactionId);
  assert.equal(payload.item.originalFilename, 'slip.png');
  assert.equal(payload.item.mimeType, 'image/png');
  assert.equal(payload.item.url.includes(`/uploads/transactions/${transactionId}/`), true);
  assert.equal(payload.transaction.attachments.length, 1);
});

test('deletes a transaction slip image and removes it from the transaction', async () => {
  const { cookie } = await registerAndAuthenticate({ app });
  const account = await createAccount({ app, cookie });
  const category = await createCategory({ app, cookie, kind: 'expense' });
  const created = await createTransaction({
    app,
    cookie,
    accountId: account.id,
    categoryId: category.id,
    note: 'delete slip',
  });

  assert.equal(created.statusCode, 201, created.body);

  const transactionId = created.json().item.id as string;
  const uploaded = await uploadAttachment({ app, cookie, transactionId });
  assert.equal(uploaded.statusCode, 201, uploaded.body);

  const attachmentId = uploaded.json().item.id as string;
  const deleted = await app.inject({
    method: 'DELETE',
    url: `/transactions/${transactionId}/attachments/${attachmentId}`,
    headers: {
      cookie,
    },
  });

  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal(deleted.json().message, 'Transaction attachment deleted successfully.');
  assert.equal(deleted.json().transaction.attachments.length, 0);

  const fetched = await app.inject({
    method: 'GET',
    url: `/transactions/${transactionId}`,
    headers: {
      cookie,
    },
  });

  assert.equal(fetched.statusCode, 200, fetched.body);
  assert.equal(fetched.json().item.attachments.length, 0);
});
