/**
 * ThreadRepository — in-memory store for investigation threads.
 * Swappable to persistent storage later.
 */

import type { InvestigationReport, AgentEvent, InvestigationMode } from '@ai-debug/shared';

export type InvestigationThread = {
  id: string;
  status: 'running' | 'done' | 'error';
  request: { url: string; hint?: string; mode: InvestigationMode };
  report: InvestigationReport | null;
  error: string | null;
  subscribers: ((event: AgentEvent) => void)[];
};

export type ThreadRepository = {
  create: (request: InvestigationThread['request']) => InvestigationThread;
  get: (threadId: string) => InvestigationThread | undefined;
  update: (threadId: string, patch: Partial<InvestigationThread>) => void;
};

export const createInMemoryThreadRepository = (): ThreadRepository => {
  const threads = new Map<string, InvestigationThread>();

  return {
    create: (request) => {
      const thread: InvestigationThread = {
        id: `debug-${Date.now().toString()}`,
        status: 'running',
        request,
        report: null,
        error: null,
        subscribers: [],
      };
      threads.set(thread.id, thread);
      return thread;
    },
    get: (threadId) => threads.get(threadId),
    update: (threadId, patch) => {
      const thread = threads.get(threadId);
      if (thread !== undefined) Object.assign(thread, patch);
    },
  };
};
