/**
 * Pino JSONL logger — subscribes to event bus.
 */

import pino from 'pino';
import type { AgentEvent } from '@ai-debug/shared';
import type { EventBus, Unsubscribe } from './event-bus.js';

const LOG_FILE = 'ai-debug.log';

export type AgentLogger = {
  log: (event: AgentEvent) => void;
  detach: Unsubscribe;
};

const mapEventToLevel = (event: AgentEvent): 'info' | 'warn' | 'error' => {
  if (event.type === 'error') return 'error';
  if (event.type === 'sourcemap_failed') return 'warn';
  return 'info';
};

export const createLogger = (eventBus: EventBus, logFile?: string): AgentLogger => {
  const logger = pino(
    { level: 'info', timestamp: pino.stdTimeFunctions.isoTime },
    pino.destination({ dest: logFile ?? LOG_FILE, sync: false }),
  );

  const log = (event: AgentEvent): void => {
    const level = mapEventToLevel(event);
    logger[level](event, event.type);
  };

  const detach = eventBus.subscribe(log);

  return { log, detach };
};
