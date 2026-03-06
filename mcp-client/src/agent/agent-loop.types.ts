/**
 * Agent loop types.
 */

import type OpenAI from 'openai';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import type { McpCall } from '#agent/mcp-bridge.js';

export type FinishResult = {
  summary: string;
  rootCause: string;
  severity: string;
  stepsToReproduce: string[];
  evidence: {
    consoleErrors: string[];
    networkErrors: string[];
  };
  suggestedFix?: string | undefined;
};

export type AgentLoopDeps = {
  llm: LLMClient;
  playwrightCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  playwrightTools: OpenAI.Chat.ChatCompletionTool[];
  mcpCall: McpCall;
  eventBus: EventBus;
  maxIterations?: number | undefined;
};
