import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { MultipartFile } from '@fastify/multipart';

import { env } from '../../config/env';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isAllowedAttachmentMimeType(mimeType: string): boolean {
  return allowedMimeTypes.has(mimeType);
}

export function resolveUploadExtension(file: MultipartFile): string | null {
  const fromName = path.extname(file.filename).toLowerCase();

  if (fromName) {
    return fromName;
  }

  switch (file.mimetype) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return null;
  }
}

export function normalizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export async function storeTransactionAttachment(params: {
  file: MultipartFile;
  transactionId: string;
}) {
  const extension = resolveUploadExtension(params.file);

  if (!extension) {
    return null;
  }

  const originalFilename = normalizeFilename(params.file.filename || `slip${extension}`);
  const storageKey = path.posix.join(
    'transactions',
    params.transactionId,
    `${randomUUID()}${extension}`,
  );
  const absolutePath = path.join(env.UPLOAD_DIR, ...storageKey.split('/'));

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await pipeline(params.file.file, createWriteStream(absolutePath));

  return {
    storageKey,
    originalFilename,
    fileSize: Number(params.file.file.bytesRead),
    absolutePath,
  };
}

export async function removeStoredAttachment(storageKey: string): Promise<void> {
  const absolutePath = path.join(env.UPLOAD_DIR, ...storageKey.split('/'));

  await rm(absolutePath, { force: true });
}
