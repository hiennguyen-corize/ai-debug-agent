/**
 * Console logger — subscribes to event bus, writes structured logs.
 */

import { appendFileSync } from 'node:fs';
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
  const dest = logFile ?? LOG_FILE;

  const log = (event: AgentEvent): void => {
    const level = mapEventToLevel(event);
    const line = JSON.stringify({ level, time: new Date().toISOString(), ...event });
    try {
      appendFileSync(dest, `${line}\n`);
    } catch {
      // ignore write errors
    }
  };

  const detach = eventBus.subscribe(log);

  return { log, detach };
};
