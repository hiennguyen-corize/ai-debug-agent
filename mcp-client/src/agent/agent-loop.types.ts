/**
 * Agent loop types.
 */

import type OpenAI from 'openai';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import type { McpCall } from '#agent/mcp-bridge.js';

import type { MessageQueue } from '#agent/message-queue.js';
import type { InvestigationMode } from '@ai-debug/shared';

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
  codeLocation?: { file: string; line: number; column?: number | undefined; snippet?: string | undefined } | undefined;
  networkFindings?: string[] | undefined;
  timeline?: string[] | undefined;
};

export type AgentLoopDeps = {
  llm: LLMClient;
  playwrightCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  playwrightTools: OpenAI.Chat.ChatCompletionTool[];
  mcpCall: McpCall;
  eventBus: EventBus;
  maxIterations?: number | undefined;
  mode?: InvestigationMode | undefined;
  messageQueue?: MessageQueue | undefined;
};
