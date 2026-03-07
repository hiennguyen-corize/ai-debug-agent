/**
 * Routes: /reports — thin controller layer.
 */

import { Hono } from 'hono';
import type { ThreadService } from '#services/thread-service.js';
import { ok } from '#lib/response.js';

export const createReportsRoute = (service: ThreadService): Hono => {
  const route = new Hono();
  route.get('/', (c) => ok(c, service.listReports()));
  return route;
};
