/**
 * Error handling middleware — centralized error responses.
 */

import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  // eslint-disable-next-line no-console
  console.error('[API Error]', err);

  const message = err instanceof Error ? err.message : 'Internal server error';
  return c.json({ error: message }, 500);
};
