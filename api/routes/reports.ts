/**
 * Routes: /reports — list investigation reports from DB.
 */

import { Hono } from 'hono';
import { getDb } from '#db/client.js';
import { threads } from '#db/schema.js';
import { isNotNull } from 'drizzle-orm';
import { ok } from '#lib/response.js';

export const reportsRoute = new Hono();

reportsRoute.get('/', (c) => {
  const db = getDb();
  const rows = db.select().from(threads).where(isNotNull(threads.report)).all();

  const reports = rows.map((t) => ({
    threadId: t.id,
    url: t.url,
    report: t.report,
    status: t.status,
    createdAt: t.createdAt.getTime(),
  }));

  return ok(c, reports);
});
