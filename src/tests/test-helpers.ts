import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { env } from '../config/env';
import { appDataSource } from '../config/data-source';

export function readCookie(setCookieHeader: string | string[] | undefined): string {
  const rawCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

  assert.ok(rawCookie, 'Expected session cookie in response headers.');

  const cookie = rawCookie.split(';', 1)[0];
  assert.ok(cookie, 'Expected a serialized cookie value.');

  return cookie;
}

export async function resetTestDatabase(): Promise<void> {
  if (!appDataSource.isInitialized) {
    await appDataSource.initialize();
  }

  await appDataSource.synchronize(true);
}

export async function cleanupTestUploads(): Promise<void> {
  await rm(env.UPLOAD_DIR, { recursive: true, force: true });
}

export async function registerAndAuthenticate(params: {
  app: FastifyInstance;
  displayName?: string;
  email?: string;
  password?: string;
}) {
  const response = await params.app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      displayName: params.displayName ?? 'Test User',
      email: params.email ?? `test-${randomUUID()}@example.com`,
      password: params.password ?? 'Password123',
    },
  });

  assert.equal(response.statusCode, 201, response.body);

  return {
    cookie: readCookie(response.headers['set-cookie']),
    user: response.json().user as { id: string; email: string },
  };
}

export async function createAccount(params: {
  app: FastifyInstance;
  cookie: string;
  name?: string;
  type?: 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'other';
  currencyCode?: string;
}) {
  const response = await params.app.inject({
    method: 'POST',
    url: '/accounts',
    headers: {
      cookie: params.cookie,
    },
    payload: {
      name: params.name ?? `Cash ${randomUUID()}`,
      type: params.type ?? 'cash',
      currencyCode: params.currencyCode ?? 'THB',
    },
  });

  assert.equal(response.statusCode, 201, response.body);

  return response.json().item as { id: string; type: string; isActive?: boolean };
}

export async function createCategory(params: {
  app: FastifyInstance;
  cookie: string;
  kind: 'income' | 'expense';
  name?: string;
}) {
  const response = await params.app.inject({
    method: 'POST',
    url: '/categories',
    headers: {
      cookie: params.cookie,
    },
    payload: {
      name: params.name ?? `${params.kind}-${randomUUID()}`,
      kind: params.kind,
    },
  });

  assert.equal(response.statusCode, 201, response.body);

  return response.json().item as { id: string; kind: 'income' | 'expense'; isActive?: boolean };
}

export async function createTransaction(params: {
  app: FastifyInstance;
  cookie: string;
  accountId: string;
  categoryId: string;
  type?: 'income' | 'expense';
  amount?: number;
  occurredAt?: string;
  note?: string | null;
}) {
  return params.app.inject({
    method: 'POST',
    url: '/transactions',
    headers: {
      cookie: params.cookie,
    },
    payload: {
      accountId: params.accountId,
      categoryId: params.categoryId,
      type: params.type ?? 'expense',
      amount: params.amount ?? 120.5,
      occurredAt: params.occurredAt ?? '2026-05-11T10:00:00.000Z',
      note: params.note,
    },
  });
}

export async function uploadAttachment(params: {
  app: FastifyInstance;
  cookie: string;
  transactionId: string;
}) {
  const boundary = `----test-${randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(
      'Content-Disposition: form-data; name="file"; filename="slip.png"\r\n' +
        'Content-Type: image/png\r\n\r\n',
    ),
    Buffer.from('fake-image-bytes'),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  return params.app.inject({
    method: 'POST',
    url: `/transactions/${params.transactionId}/attachments`,
    headers: {
      cookie: params.cookie,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  });
}
