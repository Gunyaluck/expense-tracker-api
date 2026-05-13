import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import dayjs from 'dayjs';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  SESSION_ABSOLUTE_TTL_DAYS,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
  SESSION_COOKIE_SAME_SITE,
  SESSION_HEADER_NAME,
  SESSION_IDLE_TTL_MINUTES,
} from './session.constants';
import { env } from '../../config/env';

export interface SessionTokenBundle {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export function createSessionToken(): SessionTokenBundle {
  const rawToken = randomBytes(48).toString('hex');

  return {
    rawToken,
    tokenHash: hashSessionToken(rawToken),
    expiresAt: dayjs().add(SESSION_ABSOLUTE_TTL_DAYS, 'day').toDate(),
  };
}

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256')
    .update(`${rawToken}:${env.SESSION_SECRET}`)
    .digest('hex');
}

export function tokensMatch(rawToken: string, tokenHash: string): boolean {
  const computedHash = hashSessionToken(rawToken);
  const left = Buffer.from(computedHash, 'utf8');
  const right = Buffer.from(tokenHash, 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function getSessionIdleExpiry(): Date {
  return dayjs().add(SESSION_IDLE_TTL_MINUTES, 'minute').toDate();
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, part) => {
      const separatorIndex = part.indexOf('=');

      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      accumulator[key] = value;

      return accumulator;
    }, {});
}

export function getSessionTokenFromRequest(request: FastifyRequest): string | null {
  const headerToken = request.headers[SESSION_HEADER_NAME];

  if (typeof headerToken === 'string' && headerToken.length > 0) {
    return headerToken;
  }

  const cookies = parseCookies(request.headers.cookie);

  return cookies[SESSION_COOKIE_NAME] ?? null;
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=${SESSION_COOKIE_PATH}`,
    'HttpOnly',
    `SameSite=${SESSION_COOKIE_SAME_SITE}`,
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (env.SESSION_COOKIE_SECURE) {
    parts.push('Secure');
  }

  reply.header('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(reply: FastifyReply): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    `Path=${SESSION_COOKIE_PATH}`,
    'HttpOnly',
    `SameSite=${SESSION_COOKIE_SAME_SITE}`,
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
  ];

  if (env.SESSION_COOKIE_SECURE) {
    parts.push('Secure');
  }

  reply.header('Set-Cookie', parts.join('; '));
}
