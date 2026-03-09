/**
 * REST API server — Hono entry point with dependency injection.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from '#lib/logger.js';
import { apiKeyAuth } from '#middleware/auth.js';
import { errorHandler } from '#middleware/error-handler.js';
import { requestLogger } from '#middleware/request-logger.js';
import { getDb } from '#db/client.js';
import { createThreadRepository } from '#repositories/thread-repository.js';
import { createArtifactRepository } from '#repositories/artifact-repository.js';
import { createEventDispatcher } from '#services/event-dispatcher.js';
import { createPipelineQueue } from '#services/pipeline-queue.js';
import { createThreadService } from '#services/thread-service.js';
import { createInvestigateRoute } from '#routes/investigate.js';
import { createReportsRoute } from '#routes/reports.js';

const db = getDb();
const threadRepo = createThreadRepository(db);
const artifactRepo = createArtifactRepository(db);

// Clean up orphaned threads from previous crash/restart
const cleaned = threadRepo.cleanupOrphaned();
if (cleaned > 0) logger.info(`Cleaned up ${cleaned.toString()} orphaned thread(s) from previous session`);

const dispatcher = createEventDispatcher();
const queue = createPipelineQueue();
const threadService = createThreadService({ repo: threadRepo, artifactRepo, dispatcher, queue });

const app = new Hono();

app.onError(errorHandler);
app.use('*', cors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173' }));
app.use('*', requestLogger);

app.get('/', (c) => c.json({ service: 'ai-debug-agent', version: '0.1.0' }));
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

app.use('*', apiKeyAuth);
app.route('/investigate', createInvestigateRoute(threadService));
app.route('/reports', createReportsRoute(threadService));

const port = Number(process.env['PORT'] ?? 3100);

const server = serve({ fetch: app.fetch, port }, () => {
  logger.info(`AI Debug API running on http://localhost:${port.toString()}`);
});

// Graceful shutdown — give Playwright subprocesses time to clean up
const shutdown = (): void => {
  logger.info('Shutting down...');
  server.close(() => { process.exit(0); });
  // Force exit after 5s if hanging
  setTimeout(() => { process.exit(1); }, 5000).unref();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app };
