/**
 * MCP Client entry point — load config, create bridge, run investigation.
 */

import { createDefaultBridge } from './agent/bridge-factory.js';
import { runInvestigationPipeline } from './service/investigation-service.js';
import { createLogger } from './observability/logger.js';
import { createEventBus } from './observability/event-bus.js';
import type { InvestigationRequest } from '@ai-debug/shared';

export const runInvestigation = async (request: InvestigationRequest): Promise<void> => {
  const eventBus = createEventBus();
  const logger = createLogger(eventBus);
  const bridge = await createDefaultBridge();

  try {
    await runInvestigationPipeline(request, {
      mcpCall: bridge.call,
      onEvent: (event) => { eventBus.emit(event); },
      configOverrides: request.config,
    });
  } finally {
    logger.detach();
    await bridge.close();
  }
};
