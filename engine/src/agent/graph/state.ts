/**
 * LangGraph investigation state — types and Annotation-based state.
 *
 * Non-serializable deps (eventBus, playwrightCall, sourceMapCall)
 * are passed via RunnableConfig.configurable, NOT through state.
 */

import { Annotation } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { EventBus } from '#observability/event-bus.js';
import type { FinishResult, SourceMapCall } from '#agent/loop/types.js';

// ── Graph types ──────────────────────────────────────────────────────────

export type TriedAction = {
  tool: string;
  argsKey: string;
  sig: string;
  success: boolean;
  iteration: number;
};

export type ToolResult = { resultStr: string; success: boolean; durationMs: number };
export type ToolCallInfo = { name: string; id: string | undefined; args: Record<string, unknown> };
export type ParallelResult = { msg: BaseMessage; tried: TriedAction; phase: string };

export type FetchJsSnippetFn = (args: { url: string; line: number; context?: number | undefined }) => Promise<string>;

export type LangChainTool = { name: string; description: string; schema: Record<string, unknown> };

/** Non-serializable dependencies passed via config.configurable */
export type InvestigationConfigurable = {
  eventBus: EventBus;
  playwrightCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  sourceMapCall: SourceMapCall;
};

// ── State definition ─────────────────────────────────────────────────────

/** Overwrite reducer — latest update wins */
const overwrite = <T>(current: T, update: T): T => update;

/** Append reducer — concatenates arrays */
const append = <T>(current: T[], update: T[]): T[] => [...current, ...update];

export const InvestigationState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: overwrite,
    default: () => [],
  }),

  url: Annotation<string>({ reducer: overwrite, default: () => '' }),
  hint: Annotation<string>({ reducer: overwrite, default: () => '' }),
  mode: Annotation<string>({ reducer: overwrite, default: () => 'autonomous' }),

  phase: Annotation<string>({ reducer: overwrite, default: () => 'scouting' }),
  iteration: Annotation<number>({ reducer: overwrite, default: () => 0 }),
  maxIterations: Annotation<number>({ reducer: overwrite, default: () => 30 }),
  contextWindow: Annotation<number>({ reducer: overwrite, default: () => 128_000 }),
  lastPromptTokens: Annotation<number>({ reducer: overwrite, default: () => 0 }),

  triedActions: Annotation<TriedAction[]>({
    reducer: append,
    default: () => [],
  }),
  stallCount: Annotation<number>({ reducer: overwrite, default: () => 0 }),
  lastCircularIter: Annotation<number>({ reducer: overwrite, default: () => -10 }),
  noToolCount: Annotation<number>({ reducer: overwrite, default: () => 0 }),

  result: Annotation<FinishResult | null>({ reducer: overwrite, default: () => null }),
});

export type InvestigationStateType = typeof InvestigationState.State;
