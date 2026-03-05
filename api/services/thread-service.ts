/**
 * ThreadService — business logic for investigation threads.
 */

import type { ThreadRepository, ThreadRecord } from '#repositories/thread-repository.js';
import type { AgentEvent, InvestigationReport, InvestigationMode } from '@ai-debug/shared';

type EventSubscriber = (event: AgentEvent) => void;

type StartInvestigationInput = {
  url: string;
  hint: string;
  mode: InvestigationMode;
  config?: Record<string, unknown> | undefined;
  callbackUrl?: string | undefined;
};

export const createThreadService = (repo: ThreadRepository) => {
  const liveSubscribers = new Map<string, EventSubscriber[]>();

  const generateId = (): string => `debug-${Date.now().toString()}`;

  return {
    createThread(input: StartInvestigationInput): ThreadRecord {
      const id = generateId();
      const thread = repo.create({ id, url: input.url, hint: input.hint, mode: input.mode });
      liveSubscribers.set(id, []);
      return thread;
    },

    getThread(threadId: string): ThreadRecord | undefined {
      return repo.findById(threadId);
    },

    listThreads(): ThreadRecord[] {
      return repo.findAll();
    },

    getThreadEvents(threadId: string): AgentEvent[] {
      return repo.findEventsByThreadId(threadId);
    },

    completeThread(threadId: string, report: InvestigationReport | null): void {
      if (report !== null) {
        repo.updateReport(threadId, report);
      } else {
        repo.updateStatus(threadId, 'done');
      }
      liveSubscribers.delete(threadId);
    },

    failThread(threadId: string, error: string): void {
      repo.updateError(threadId, error);
      liveSubscribers.delete(threadId);
    },

    handleEvent(threadId: string, event: AgentEvent): void {
      repo.insertEvent(threadId, event);
      const subs = liveSubscribers.get(threadId);
      if (subs !== undefined) {
        for (const sub of subs) sub(event);
      }
    },

    subscribe(threadId: string, subscriber: EventSubscriber): void {
      const subs = liveSubscribers.get(threadId);
      if (subs !== undefined) subs.push(subscriber);
    },

    unsubscribe(threadId: string, subscriber: EventSubscriber): void {
      const subs = liveSubscribers.get(threadId);
      if (subs === undefined) return;
      const idx = subs.indexOf(subscriber);
      if (idx !== -1) subs.splice(idx, 1);
    },

    isRunning(threadId: string): boolean {
      const thread = repo.findById(threadId);
      return thread?.status === 'running';
    },

    async startPipeline(thread: ThreadRecord, input: StartInvestigationInput): Promise<void> {
      try {
        const { createDefaultBridge } = await import('@ai-debug/mcp-client/agent/bridge-factory');
        const { runInvestigationPipeline } = await import('@ai-debug/mcp-client/service/investigation-service');

        const bridge = await createDefaultBridge();
        try {
          const report = await runInvestigationPipeline(
            { url: thread.url, hint: thread.hint, mode: thread.mode },
            {
              mcpCall: bridge.call,
              onEvent: (event: AgentEvent) => this.handleEvent(thread.id, event),
              callbackUrl: input.callbackUrl,
              configOverrides: input.config,
            },
          );
          this.completeThread(thread.id, report);
        } finally {
          await bridge.close();
        }
      } catch (err) {
        this.failThread(thread.id, err instanceof Error ? err.message : String(err));
      }
    },
  };
};

export type ThreadService = ReturnType<typeof createThreadService>;
