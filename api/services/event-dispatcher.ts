/**
 * EventDispatcher — pub/sub management for live SSE subscribers.
 */

import type { AgentEvent } from '@ai-debug/shared';
import { logger } from '#lib/logger.js';

export type EventSubscriber = (event: AgentEvent) => void;

export type EventDispatcher = {
  init(threadId: string): void;
  cleanup(threadId: string): void;
  subscribe(threadId: string, subscriber: EventSubscriber): void;
  unsubscribe(threadId: string, subscriber: EventSubscriber): void;
  dispatch(threadId: string, event: AgentEvent): void;
};

export const createEventDispatcher = (): EventDispatcher => {
  const liveSubscribers = new Map<string, EventSubscriber[]>();

  return {
    init(threadId: string): void {
      liveSubscribers.set(threadId, []);
    },

    cleanup(threadId: string): void {
      liveSubscribers.delete(threadId);
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

    dispatch(threadId: string, event: AgentEvent): void {
      const subs = liveSubscribers.get(threadId);
      if (subs === undefined) return;
      for (const sub of subs) {
        try {
          sub(event);
        } catch (err) {
          logger.error({ threadId, err }, '[EventDispatcher] Subscriber error');
        }
      }
    },
  };
};
