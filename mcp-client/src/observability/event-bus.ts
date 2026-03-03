/**
 * Typed event bus — pub/sub for agent events.
 */

import type { AgentEvent } from '@ai-debug/shared';

export type EventHandler = (event: AgentEvent) => void;
export type Unsubscribe = () => void;

export type EventBus = {
  emit: (event: AgentEvent) => void;
  subscribe: (handler: EventHandler) => Unsubscribe;
  clear: () => void;
};

export const createEventBus = (): EventBus => {
  const handlers = new Set<EventHandler>();

  return {
    emit: (event) => {
      for (const handler of handlers) handler(event);
    },
    subscribe: (handler) => {
      handlers.add(handler);
      return () => { handlers.delete(handler); };
    },
    clear: () => { handlers.clear(); },
  };
};
