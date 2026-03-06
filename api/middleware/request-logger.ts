/**
 * Request logger middleware — structured request/response logging.
 */

import type { MiddlewareHandler } from 'hono';
import { logger } from '#lib/logger.js';

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Math.round(performance.now() - start);
  const status = c.res.status;

  logger.info({ method, path, status, duration }, `${method} ${path} → ${status.toString()}`);
};
