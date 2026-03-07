/**
 * Engine entry point — load config, run investigation directly.
 * No MCP bridge — playwright bridge for browser, direct calls for source maps.
 */

import { runInvestigationPipeline } from '#service/investigation-service.js';
import { createLogger } from '#observability/logger.js';
import { createEventBus } from '#observability/event-bus.js';
import type { InvestigationRequest } from '@ai-debug/shared';

export { runInvestigationPipeline } from '#service/investigation-service.js';
export type { InvestigationDeps } from '#service/investigation-service.js';
export type { FinishResult, AgentLoopDeps } from '#agent/loop/types.js';

export const runInvestigation = async (request: InvestigationRequest): Promise<void> => {
  const eventBus = createEventBus();
  const logger = createLogger(eventBus);

  try {
    await runInvestigationPipeline(request, {
      onEvent: (event) => { eventBus.emit(event); },
      configOverrides: request.config,
    });
  } finally {
    logger.detach();
  }
};
