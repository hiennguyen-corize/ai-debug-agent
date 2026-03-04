/**
 * REST API server — Hono entry point.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { apiKeyAuth } from '#middleware/auth.js';
import { investigateRoute } from '#routes/investigate.js';
import { reportsRoute } from '#routes/reports.js';

const app = new Hono();

app.get('/', (c) => c.json({ service: 'ai-debug-agent', version: '0.1.0' }));

app.use('*', apiKeyAuth);
app.route('/investigate', investigateRoute);
app.route('/reports', reportsRoute);

const port = Number(process.env['PORT'] ?? 3100);

serve({ fetch: app.fetch, port }, () => {
  // eslint-disable-next-line no-console
  console.log(`AI Debug API running on http://localhost:${port.toString()}`);
});

export { app };
