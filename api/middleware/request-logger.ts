/**
 * Request logger middleware — structured request/response logging.
 */

import type { MiddlewareHandler } from 'hono';

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Math.round(performance.now() - start);
  const status = c.res.status;

  // eslint-disable-next-line no-console
  console.log(`${method} ${path} → ${status.toString()} (${duration.toString()}ms)`);
};
