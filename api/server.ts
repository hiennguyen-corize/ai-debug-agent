/**
 * REST API server — Hono entry point with dependency injection.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { apiKeyAuth } from '#middleware/auth.js';
import { errorHandler } from '#middleware/error-handler.js';
import { requestLogger } from '#middleware/request-logger.js';
import { getDb } from '#db/client.js';
import { createThreadRepository } from '#repositories/thread-repository.js';
import { createThreadService } from '#services/thread-service.js';
import { createInvestigateRoute } from '#routes/investigate.js';
import { reportsRoute } from '#routes/reports.js';

const db = getDb();
const threadRepo = createThreadRepository(db);
const threadService = createThreadService(threadRepo);

const app = new Hono();

app.onError(errorHandler);
app.use('*', requestLogger);

app.get('/', (c) => c.json({ service: 'ai-debug-agent', version: '0.1.0' }));
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

app.use('*', apiKeyAuth);
app.route('/investigate', createInvestigateRoute(threadService));
app.route('/reports', reportsRoute);

const port = Number(process.env['PORT'] ?? 3100);

serve({ fetch: app.fetch, port }, () => {
  // eslint-disable-next-line no-console
  console.log(`AI Debug API running on http://localhost:${port.toString()}`);
});

export { app };
