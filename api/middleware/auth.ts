/**
 * Auth middleware — X-API-Key header validation.
 * Disabled when AI_DEBUG_API_KEY env var is not set (dev mode).
 * Uses timing-safe comparison to prevent timing attacks.
 */

import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

const API_KEY_HEADER = 'x-api-key';

const safeCompare = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Pad to same length to avoid timing leak on length mismatch
  const maxLen = Math.max(bufA.length, bufB.length, 1);
  const padA = Buffer.alloc(maxLen);
  const padB = Buffer.alloc(maxLen);
  bufA.copy(padA);
  bufB.copy(padB);
  return timingSafeEqual(padA, padB) && bufA.length === bufB.length;
};

export const apiKeyAuth: MiddlewareHandler = async (c, next) => {
  const expected = process.env['AI_DEBUG_API_KEY'];
  if (expected === undefined || expected === '') {
    await next();
    return;
  }

  const provided = c.req.header(API_KEY_HEADER) ?? c.req.query('apiKey') ?? '';
  if (!safeCompare(provided, expected)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
};

