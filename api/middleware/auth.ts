/**
 * Auth middleware — X-API-Key header validation.
 * Disabled when AI_DEBUG_API_KEY env var is not set (dev mode).
 */

import type { MiddlewareHandler } from 'hono';

const API_KEY_HEADER = 'x-api-key';

export const apiKeyAuth: MiddlewareHandler = async (c, next) => {
  const expected = process.env['AI_DEBUG_API_KEY'];
  if (expected === undefined || expected === '') {
    await next();
    return;
  }

  const provided = c.req.header(API_KEY_HEADER);
  if (provided !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
};
