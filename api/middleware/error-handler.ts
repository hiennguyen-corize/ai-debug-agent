/**
 * Error handling middleware — centralized error responses.
 */

import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from '#lib/logger.js';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  logger.error({ err }, '[API Error]');

  const message = err instanceof Error ? err.message : 'Internal server error';
  return c.json({ error: message }, 500);
};
