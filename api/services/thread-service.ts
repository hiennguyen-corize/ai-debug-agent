/**
 * ThreadService — business logic for investigation threads.
 */

import type { ThreadRepository, ThreadRecord } from '#repositories/thread-repository.js';
import type { AgentEvent, InvestigationReport, InvestigationMode, InvestigationRequest } from '@ai-debug/shared';
import { INVESTIGATION_MODE } from '@ai-debug/shared';
import { createMessageQueue, type MessageQueue } from '@ai-debug/engine/agent/message-queue';
import type { ThreadListItem, ThreadDetail, CreateThreadResult, ReportListItem } from '#lib/dtos.js';

type EventSubscriber = (event: AgentEvent) => void;

type StartInvestigationInput = {
  url: string;
  hint: string;
  mode: InvestigationMode;
  config?: Record<string, unknown> | undefined;
  callbackUrl?: string | undefined;
};

const toListItem = (t: ThreadRecord): ThreadListItem => ({
  threadId: t.id,
  status: t.status,
  request: { url: t.url, hint: t.hint, mode: t.mode },
  report: t.report,
  error: t.error,
  createdAt: t.createdAt.getTime(),
});

const toDetail = (t: ThreadRecord): ThreadDetail => ({
  threadId: t.id,
  status: t.status,
  request: { url: t.url, hint: t.hint, mode: t.mode },
  report: t.report,
  error: t.error,
});

export type ThreadService = {
  listThreadDTOs(): ThreadListItem[];
  getThreadDTO(threadId: string): ThreadDetail | undefined;
  startInvestigation(data: InvestigationRequest): CreateThreadResult;
  streamEvents(threadId: string, onEvent: EventSubscriber): Promise<void>;
  listReports(): ReportListItem[];
  getThread(threadId: string): ThreadRecord | undefined;
  getThreadEvents(threadId: string): AgentEvent[];
  sendMessage(threadId: string, message: string): boolean;
  isRunning(threadId: string): boolean;
};

export const createThreadService = (repo: ThreadRepository): ThreadService => {
  const liveSubscribers = new Map<string, EventSubscriber[]>();
  const messageQueues = new Map<string, MessageQueue>();
  let pipelineChain: Promise<void> = Promise.resolve();
  let runningCount = 0;

  const generateId = (): string => `debug-${Date.now().toString()}`;

  const subscribe = (threadId: string, subscriber: EventSubscriber): void => {
    const subs = liveSubscribers.get(threadId);
    if (subs !== undefined) subs.push(subscriber);
  };

  const unsubscribe = (threadId: string, subscriber: EventSubscriber): void => {
    const subs = liveSubscribers.get(threadId);
    if (subs === undefined) return;
    const idx = subs.indexOf(subscriber);
    if (idx !== -1) subs.splice(idx, 1);
  };

  const handleEvent = (threadId: string, event: AgentEvent): void => {
    repo.insertEvent(threadId, event);
    const subs = liveSubscribers.get(threadId);
    if (subs !== undefined) {
      for (const sub of subs) sub(event);
    }
  };

  const completeThread = (threadId: string, report: InvestigationReport | null): void => {
    if (report !== null) {
      repo.updateReport(threadId, report);
    } else {
      repo.updateStatus(threadId, 'done');
    }
    liveSubscribers.delete(threadId);
    messageQueues.delete(threadId);
  };

  const failThread = (threadId: string, error: string): void => {
    repo.updateError(threadId, error);
    liveSubscribers.delete(threadId);
    messageQueues.delete(threadId);
  };

  const createThread = (input: StartInvestigationInput): ThreadRecord => {
    const id = generateId();
    const thread = repo.create({ id, url: input.url, hint: input.hint, mode: input.mode });
    liveSubscribers.set(id, []);
    if (input.mode === INVESTIGATION_MODE.INTERACTIVE) {
      messageQueues.set(id, createMessageQueue());
    }
    return thread;
  };

  const startPipeline = async (thread: ThreadRecord, input: StartInvestigationInput): Promise<void> => {
    const position = runningCount;
    runningCount++;

    if (position > 0) {
      repo.updateStatus(thread.id, 'queued');
      handleEvent(thread.id, {
        type: 'investigation_queued',
        position,
        message: `Queued at position ${position.toString()}. Waiting for current investigation to finish.`,
      });
    }

    const previousChain = pipelineChain;
    pipelineChain = previousChain.then(async () => {
      repo.updateStatus(thread.id, 'running');
      try {
        const { runInvestigationPipeline } = await import('@ai-debug/engine/service/investigation-service');

        const report = await runInvestigationPipeline(
          { url: thread.url, hint: thread.hint, mode: thread.mode },
          {
            onEvent: (event: AgentEvent) => { handleEvent(thread.id, event); },
            configOverrides: input.config,
            messageQueue: messageQueues.get(thread.id),
          },
        );
        completeThread(thread.id, report);
      } catch (err) {
        failThread(thread.id, err instanceof Error ? err.message : String(err));
      } finally {
        runningCount--;
      }
    });

    await pipelineChain;
  };

  return {
    listThreadDTOs(): ThreadListItem[] {
      return repo.findAll().map(toListItem);
    },

    getThreadDTO(threadId: string): ThreadDetail | undefined {
      const thread = repo.findById(threadId);
      return thread !== undefined ? toDetail(thread) : undefined;
    },

    startInvestigation(data: InvestigationRequest): CreateThreadResult {
      const input: StartInvestigationInput = {
        url: data.url,
        hint: data.hint ?? '',
        mode: data.mode,
        config: data.config,
        callbackUrl: data.callbackUrl,
      };
      const thread = createThread(input);
      const position = runningCount;
      void startPipeline(thread, input);
      return {
        threadId: thread.id,
        status: position > 0 ? 'queued' : 'started',
        ...(position > 0 ? { position } : {}),
      };
    },

    async streamEvents(threadId: string, onEvent: EventSubscriber): Promise<void> {
      subscribe(threadId, onEvent);
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!this.isRunning(threadId)) {
            clearInterval(check);
            resolve();
          }
        }, 500);
      });
      unsubscribe(threadId, onEvent);
    },

    listReports(): ReportListItem[] {
      return repo.findWithReports().map((t) => ({
        threadId: t.id,
        url: t.url,
        report: t.report !== null ? JSON.stringify(t.report) : null,
        status: t.status,
        createdAt: t.createdAt.getTime(),
      }));
    },

    getThread(threadId: string): ThreadRecord | undefined {
      return repo.findById(threadId);
    },

    getThreadEvents(threadId: string): AgentEvent[] {
      return repo.findEventsByThreadId(threadId);
    },

    isRunning(threadId: string): boolean {
      const thread = repo.findById(threadId);
      return thread?.status === 'running';
    },

    sendMessage(threadId: string, message: string): boolean {
      const queue = messageQueues.get(threadId);
      if (queue === undefined) return false;
      queue.push(message);
      return true;
    },
  };
};
