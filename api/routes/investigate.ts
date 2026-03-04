/**
 * Routes: /investigate
 *
 * POST /           — start investigation (fire-and-forget, returns threadId)
 * GET  /:threadId  — poll investigation status
 * GET  /:threadId/stream — SSE stream of investigation progress
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  InvestigationRequestSchema,
  type InvestigationReport,
  type AgentEvent,
} from '@ai-debug/shared';

type InvestigationThread = {
  id: string;
  status: 'running' | 'done' | 'error';
  request: { url: string; hint?: string; mode: string };
  report: InvestigationReport | null;
  error: string | null;
  subscribers: ((event: AgentEvent) => void)[];
};

const threads = new Map<string, InvestigationThread>();

export const investigateRoute = new Hono();

investigateRoute.post('/', async (c) => {
  const body = InvestigationRequestSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.flatten() }, 400);
  }

  const threadId = `debug-${Date.now().toString()}`;
  const thread: InvestigationThread = {
    id: threadId,
    status: 'running',
    request: { url: body.data.url, hint: body.data.hint ?? '', mode: body.data.mode },
    report: null,
    error: null,
    subscribers: [],
  };
  threads.set(threadId, thread);

  // Fire-and-forget graph invocation
  void (async () => {
    try {
      const { createInvestigationGraph } = await import('@ai-debug/mcp-client/graph');
      const { createLLMClient } = await import('@ai-debug/mcp-client/agent/llm-client');
      const { createEventBus } = await import('@ai-debug/mcp-client/observability/event-bus');
      const { loadConfig } = await import('@ai-debug/mcp-client/agent/config-loader');
      const { AGENT_NAME } = await import('@ai-debug/shared');

      const config = await loadConfig(body.data.config);
      const eventBus = createEventBus();

      // Broadcast events to SSE subscribers
      eventBus.subscribe((event) => {
        for (const sub of thread.subscribers) sub(event);
      });

      const graph = await createInvestigationGraph({
        investigatorLLM: createLLMClient(AGENT_NAME.INVESTIGATOR, config),
        explorerLLM: createLLMClient(AGENT_NAME.EXPLORER, config),
        scoutLLM: createLLMClient(AGENT_NAME.SCOUT, config),
        synthesisLLM: createLLMClient(AGENT_NAME.SYNTHESIS, config),
        eventBus,
        mcpCall: (tool, args) => Promise.resolve({ tool, args, status: 'dispatched' }),
        promptUser: (q) => Promise.resolve(`[AUTONOMOUS] Skipped: ${q}`),
      });

      const result = await graph.invoke({
        url: body.data.url,
        hint: body.data.hint ?? '',
        investigationMode: body.data.mode,
      });

      thread.report = result.finalReport ?? null;
      thread.status = 'done';
    } catch (err) {
      thread.error = err instanceof Error ? err.message : String(err);
      thread.status = 'error';
    }
  })();

  return c.json({ threadId, status: 'started' }, 201);
});

investigateRoute.get('/:threadId', (c) => {
  const thread = threads.get(c.req.param('threadId'));
  if (!thread) return c.json({ error: 'Thread not found' }, 404);

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
  if (!thread) return c.json({ error: 'Thread not found' }, 404);

  return streamSSE(c, async (stream) => {
    const onEvent = (event: AgentEvent): void => {
      void stream.writeSSE({ data: JSON.stringify(event) });
    };

    thread.subscribers.push(onEvent);

    // Keep alive until investigation done
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (thread.status !== 'running') {
          clearInterval(check);
          resolve();
        }
      }, 500);
    });

    // Remove subscriber
    const idx = thread.subscribers.indexOf(onEvent);
    if (idx !== -1) thread.subscribers.splice(idx, 1);
  });
});
