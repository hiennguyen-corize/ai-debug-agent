/**
 * ThreadService — business logic for investigation threads.
 */

import { randomUUID } from 'node:crypto';
import type { ThreadRepository, ThreadRecord } from '#repositories/thread-repository.js';
import type { ArtifactRepository } from '#repositories/artifact-repository.js';
import type { AgentEvent, InvestigationReport, InvestigationRequest } from '@ai-debug/shared';
import { INVESTIGATION_MODE, AGENT_NAME } from '@ai-debug/shared';
import { createMessageQueue, type MessageQueue } from '@ai-debug/engine/agent/message-queue';
import type { EventDispatcher, EventSubscriber } from './event-dispatcher.js';
import type { PipelineQueue } from './pipeline-queue.js';
import { toListItem, toDetail, type ThreadListItem, type ThreadDetail, type CreateThreadResult, type ReportListItem } from '#lib/dtos.js';
import { logger } from '#lib/logger.js';

type ThreadServiceDeps = {
  repo: ThreadRepository;
  artifactRepo: ArtifactRepository;
  dispatcher: EventDispatcher;
  queue: PipelineQueue;
};

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
  findArtifactsByThread(threadId: string): ReturnType<ArtifactRepository['findByThread']>;
};

export const createThreadService = (deps: ThreadServiceDeps): ThreadService => {
  const { repo, artifactRepo, dispatcher, queue } = deps;
  const messageQueues = new Map<string, MessageQueue>();

  const generateId = (): string => `debug-${randomUUID()}`;

  const handleEvent = (threadId: string, event: AgentEvent): void => {
    try {
      repo.insertEvent(threadId, event);
    } catch (err) {
      logger.error({ threadId, err }, '[ThreadService] Failed to persist event');
    }

    if (event.type === 'artifact_captured') {
      try {
        artifactRepo.insert({
          threadId,
          type: event.artifactType,
          name: event.name,
          content: event.content,
          toolCallId: event.toolCallId,
        });
      } catch (err) {
        logger.error({ threadId, err }, '[ThreadService] Failed to persist artifact');
      }
    }

    dispatcher.dispatch(threadId, event);
  };

  const completeThread = (threadId: string, report: InvestigationReport | null): void => {
    if (report !== null) {
      repo.updateReport(threadId, report);
    } else {
      repo.updateStatus(threadId, 'done');
    }
    dispatcher.cleanup(threadId);
    const mq = messageQueues.get(threadId);
    if (mq !== undefined) mq.cancel();
    messageQueues.delete(threadId);
  };

  const failThread = (threadId: string, error: string): void => {
    logger.error({ threadId, error }, '[ThreadService] Investigation failed');
    handleEvent(threadId, { type: 'error', agent: AGENT_NAME.AGENT, message: error });
    repo.updateError(threadId, error);
    dispatcher.cleanup(threadId);
    messageQueues.delete(threadId);
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
      const id = generateId();
      const thread = repo.create({ id, url: data.url, hint: data.hint ?? '', mode: data.mode });
      dispatcher.init(id);

      if (data.mode === INVESTIGATION_MODE.INTERACTIVE) {
        messageQueues.set(id, createMessageQueue());
      }

      const { position } = queue.enqueue(async () => {
        if (position > 0) {
          repo.updateStatus(thread.id, 'queued');
          handleEvent(thread.id, {
            type: 'investigation_queued',
            position,
            message: `Queued at position ${position.toString()}. Waiting for current investigation to finish.`,
          });
        }

        repo.updateStatus(thread.id, 'running');
        try {
          const { runInvestigationPipeline } = await import('@ai-debug/engine/service/investigation-service');
          const report = await runInvestigationPipeline(
            { url: thread.url, hint: thread.hint, mode: thread.mode },
            {
              onEvent: (event: AgentEvent) => { handleEvent(thread.id, event); },
              configOverrides: data.config,
              messageQueue: messageQueues.get(thread.id),
              threadId: thread.id,
            },
          );
          completeThread(thread.id, report);
        } catch (err) {
          failThread(thread.id, err instanceof Error ? err.message : String(err));
        }
      });

      return {
        threadId: id,
        status: position > 0 ? 'queued' : 'started',
        ...(position > 0 ? { position } : {}),
      };
    },

    async streamEvents(threadId: string, onEvent: EventSubscriber): Promise<void> {
      dispatcher.subscribe(threadId, onEvent);
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!this.isRunning(threadId)) {
            clearInterval(check);
            resolve();
          }
        }, 500);
      });
      dispatcher.unsubscribe(threadId, onEvent);
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
      return thread?.status === 'running' || thread?.status === 'queued';
    },

    sendMessage(threadId: string, message: string): boolean {
      const mq = messageQueues.get(threadId);
      if (mq === undefined) return false;
      mq.push(message);
      return true;
    },

    findArtifactsByThread(threadId: string) {
      return artifactRepo.findByThread(threadId);
    },
  };
};
