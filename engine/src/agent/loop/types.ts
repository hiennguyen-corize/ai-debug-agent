

import type OpenAI from 'openai';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import type { MessageQueue } from '#agent/message-queue.js';
import type { InvestigationMode, ReportSeverity } from '@ai-debug/shared';

export type SourceMapCall = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

export type FinishResult = {
  summary: string;
  rootCause: string;
  severity: ReportSeverity;
  stepsToReproduce: string[];
  evidence: {
    consoleErrors: string[];
    networkErrors: string[];
  };
  suggestedFix?: string | undefined;
  codeLocation?: { file: string; line: number; column?: number | undefined; snippet?: string | undefined } | undefined;
  networkFindings?: string[] | undefined;
  timeline?: string[] | undefined;
  hypotheses?: { id: string; text: string; status: string }[] | undefined;
  conclusion?: string | undefined;
};

export type AgentLoopDeps = {
  llm: LLMClient;
  playwrightCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  playwrightTools: OpenAI.Chat.ChatCompletionTool[];
  sourceMapCall: SourceMapCall;
  eventBus: EventBus;
  maxIterations?: number | undefined;
  contextWindow?: number | undefined;
  mode?: InvestigationMode | undefined;
  messageQueue?: MessageQueue | undefined;
};
