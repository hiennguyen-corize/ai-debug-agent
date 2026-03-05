/**
 * Routes: /investigate — thin controller layer.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { InvestigationRequestSchema, type AgentEvent } from '@ai-debug/shared';
import type { ThreadService } from '#services/thread-service.js';
import { ok, created, notFound, badRequest } from '#lib/response.js';

export const createInvestigateRoute = (service: ThreadService): Hono => {
  const route = new Hono();

  route.get('/', (c) => {
    const threads = service.listThreads();
    return ok(c, threads.map((t) => ({
      threadId: t.id,
      status: t.status,
      request: { url: t.url, hint: t.hint, mode: t.mode },
      report: t.report,
      error: t.error,
      createdAt: t.createdAt.getTime(),
    })));
  });

  route.post('/', async (c) => {
    const body = InvestigationRequestSchema.safeParse(await c.req.json());
    if (!body.success) return badRequest(c, body.error.flatten());

    const input = {
      url: body.data.url,
      hint: body.data.hint ?? '',
      mode: body.data.mode,
      config: body.data.config,
      callbackUrl: body.data.callbackUrl,
    };

    const thread = service.createThread(input);
    void service.startPipeline(thread, input);

    return created(c, { threadId: thread.id, status: 'started' });
  });

  route.get('/:threadId', (c) => {
    const thread = service.getThread(c.req.param('threadId'));
    if (thread === undefined) return notFound(c, 'Thread not found');
    return ok(c, {
      threadId: thread.id,
      status: thread.status,
      request: { url: thread.url, hint: thread.hint, mode: thread.mode },
      report: thread.report,
      error: thread.error,
    });
  });

  route.get('/:threadId/events', (c) => {
    const events = service.getThreadEvents(c.req.param('threadId'));
    return ok(c, events);
  });

  route.get('/:threadId/stream', (c) => {
    const threadId = c.req.param('threadId');
    if (service.getThread(threadId) === undefined) {
      return notFound(c, 'Thread not found');
    }

    return streamSSE(c, async (stream) => {
      const onEvent = (event: AgentEvent): void => {
        void stream.writeSSE({ data: JSON.stringify(event) });
      };

      service.subscribe(threadId, onEvent);

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!service.isRunning(threadId)) {
            clearInterval(check);
            resolve();
          }
        }, 500);
      });

      service.unsubscribe(threadId, onEvent);
    });
  });

  return route;
};
