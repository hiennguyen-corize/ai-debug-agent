/**
 * Routes: /investigate — thin controller layer.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { InvestigationRequestSchema, UserMessageSchema, type AgentEvent } from '@ai-debug/shared';
import type { ThreadService } from '#services/thread-service.js';
import { ok, created, notFound, badRequest } from '#lib/response.js';

export const createInvestigateRoute = (service: ThreadService): Hono => {
  const route = new Hono();

  route.get('/', (c) => ok(c, service.listThreadDTOs()));

  route.post('/', async (c) => {
    const body = InvestigationRequestSchema.safeParse(await c.req.json());
    if (!body.success) return badRequest(c, body.error.flatten());
    return created(c, service.startInvestigation(body.data));
  });

  route.get('/:threadId', (c) => {
    const detail = service.getThreadDTO(c.req.param('threadId'));
    if (detail === undefined) return notFound(c, 'Thread not found');
    return ok(c, detail);
  });

  route.get('/:threadId/events', (c) =>
    ok(c, service.getThreadEvents(c.req.param('threadId'))),
  );

  route.get('/:threadId/artifacts', (c) =>
    ok(c, service.findArtifactsByThread(c.req.param('threadId'))),
  );

  route.get('/:threadId/stream', (c) => {
    const threadId = c.req.param('threadId');
    if (service.getThread(threadId) === undefined) {
      return notFound(c, 'Thread not found');
    }
    return streamSSE(c, async (stream) => {
      let aborted = false;
      stream.onAbort(() => { aborted = true; });

      const onEvent = (event: AgentEvent): void => {
        if (aborted) return;
        stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {
          aborted = true; // Client disconnected — stop writing
        });
      };
      await service.streamEvents(threadId, onEvent);
    });
  });

  route.post('/:threadId/message', async (c) => {
    const threadId = c.req.param('threadId');
    if (service.getThread(threadId) === undefined) return notFound(c, 'Thread not found');

    const body = UserMessageSchema.safeParse(await c.req.json());
    if (!body.success) return badRequest(c, 'message is required');

    const sent = service.sendMessage(threadId, body.data.message.trim());
    if (!sent) return badRequest(c, 'Thread is not in interactive mode or not running');
    return ok(c, { sent: true });
  });

  return route;
};
