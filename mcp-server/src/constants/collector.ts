/**
 * Collector constants — uses shared CONSOLE_LOG_TYPE.
 */

import { CONSOLE_LOG_TYPE } from '@ai-debug/shared/types.js';
import type { ConsoleLogType } from '@ai-debug/shared/types.js';

export { CONSOLE_LOG_TYPE };
export type { ConsoleLogType };

export const CORRELATION_WINDOW_MS = 3_000;

const VALID_CONSOLE_TYPES = new Set<string>(Object.values(CONSOLE_LOG_TYPE));

export const isConsoleLogType = (raw: string): raw is ConsoleLogType =>
  VALID_CONSOLE_TYPES.has(raw);
