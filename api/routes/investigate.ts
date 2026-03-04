/**
 * Routes: /investigate
 *
 * POST /           — start investigation (fire-and-forget, returns threadId)
 * GET  /:threadId  — poll investigation status
 * GET  /:threadId/stream — SSE stream of investigation progress
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { InvestigationRequestSchema, type AgentEvent } from '@ai-debug/shared';
import {
  createInMemoryThreadRepository,
  type InvestigationThread,
} from '#repositories/thread-repository.js';

const threads = createInMemoryThreadRepository();

export const investigateRoute = new Hono();

const startInvestigation = (
  thread: InvestigationThread,
  config?: Record<string, unknown>,
  callbackUrl?: string,
): void => {
  void (async () => {
    try {
      const { createDefaultBridge } = await import('@ai-debug/mcp-client/agent/bridge-factory');
      const { runInvestigationPipeline } = await import('@ai-debug/mcp-client/service/investigation-service');

      const bridge = await createDefaultBridge();

      try {
        const report = await runInvestigationPipeline(
          { url: thread.request.url, hint: thread.request.hint, mode: thread.request.mode },
          {
            mcpCall: bridge.call,
            onEvent: (event: AgentEvent) => { for (const sub of thread.subscribers) sub(event); },
            callbackUrl,
            configOverrides: config,
          },
        );
        threads.update(thread.id, { report, status: 'done' });
      } finally {
        await bridge.close();
      }
    } catch (err) {
      threads.update(thread.id, {
        error: err instanceof Error ? err.message : String(err),
        status: 'error',
      });
    }
  })();
};

investigateRoute.post('/', async (c) => {
  const body = InvestigationRequestSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const thread = threads.create({
    url: body.data.url,
    hint: body.data.hint ?? '',
    mode: body.data.mode,
  });

  startInvestigation(thread, body.data.config, body.data.callbackUrl);
  return c.json({ threadId: thread.id, status: 'started' }, 201);
});

investigateRoute.get('/:threadId', (c) => {
  const thread = threads.get(c.req.param('threadId'));
  if (thread === undefined) return c.json({ error: 'Thread not found' }, 404);
  return c.json({
    threadId: thread.id,
    status: thread.status,
    request: thread.request,
    report: thread.report,
    error: thread.error,
  });
});

investigateRoute.get('/:threadId/stream', (c) => {
  const thread = threads.get(c.req.param('threadId'));
  if (thread === undefined) return c.json({ error: 'Thread not found' }, 404);

  return streamSSE(c, async (stream) => {
    const onEvent = (event: AgentEvent): void => {
      void stream.writeSSE({ data: JSON.stringify(event) });
    };

    thread.subscribers.push(onEvent);

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (thread.status !== 'running') {
          clearInterval(check);
          resolve();
        }
      }, 500);
    });

    const idx = thread.subscribers.indexOf(onEvent);
    if (idx !== -1) thread.subscribers.splice(idx, 1);
  });
});
