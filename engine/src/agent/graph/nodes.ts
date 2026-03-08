/**
 * LangGraph nodes and conditional edges for the investigation graph.
 *
 * Nodes: createAgentNode, createToolNode, afterToolsNode, forceFinishNode, emergencyNode
 * Edges: shouldContinue, shouldContinueAfterTools
 */

import type { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AGENT_NAME } from '@ai-debug/shared';
import type { InvestigationPhase } from '@ai-debug/shared';
import { normalizeFinishResult } from '#agent/loop/normalize.js';
import { isAskUserTool } from '#agent/loop/tools.js';
import { MAX_REASONING_REPROMPT_ITERATION } from '#graph/constants.js';
import type { FinishResult } from '#agent/loop/types.js';
import type { InvestigationStateType, TriedAction, FetchJsSnippetFn, LangChainTool } from '#graph/state.js';
import { interrupt } from '@langchain/langgraph';
import {
  MAX_NO_TOOL_RETRIES,
  MAX_STALL_COUNT,
  FORCE_FINISH_MESSAGE,
  STALL_FINISH_MESSAGE,
  CRASHED_PAGE_GUIDANCE,
  ERROR_PATTERN,
  SLIDING_WINDOW_SIZE,
  HIGH_USAGE_PCT,
  MED_USAGE_PCT,
  HIGH_USAGE_WINDOW,
  MED_USAGE_WINDOW,
  CHECKPOINT_INTERVAL,
  STALL_WARNING_THRESHOLD,
} from '#graph/constants.js';
import { getConfigurable, trimOldToolResults, injectBudgetMessage, detectCircularPattern } from '#graph/helpers.js';
import { executeParallelTools } from '#graph/tool-dispatch.js';

// ── Agent Node ───────────────────────────────────────────────────────────

const REPROMPT_MESSAGE = 'You MUST include OBSERVE and PLAN text before tool calls. What did you observe from the last result? What is your hypothesis and plan?';

type RepromptDeps = {
  boundModel: ReturnType<ChatOpenAI['bindTools']>;
  eventBus: ReturnType<typeof getConfigurable>['eventBus'];
};

const handleReasoningReprompt = async (
  deps: RepromptDeps,
  workingMessages: BaseMessage[],
  response: Awaited<ReturnType<RepromptDeps['boundModel']['invoke']>>,
): Promise<typeof response> => {
  workingMessages.push(response);
  workingMessages.push(new HumanMessage({ content: REPROMPT_MESSAGE }));
  const retried = await deps.boundModel.invoke(workingMessages);
  workingMessages.pop();
  workingMessages.pop();

  if ((retried.tool_calls ?? []).length > 0) return retried;

  if (typeof retried.content === 'string' && retried.content.length > 0) {
    deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.AGENT, text: retried.content });
  }
  return response;
};

export const createAgentNode = (model: ChatOpenAI, tools: LangChainTool[]) => {
  const boundModel = model.bindTools(tools);

  return async (state: InvestigationStateType, config: RunnableConfig): Promise<Partial<InvestigationStateType>> => {
    const { messages, lastPromptTokens, contextWindow, triedActions, stallCount, iteration } = state;
    const { eventBus } = getConfigurable(config);

    const workingMessages = [...messages];
    injectBudgetMessage(workingMessages, lastPromptTokens, contextWindow, triedActions, stallCount);

    const usagePct = contextWindow > 0 ? Math.round((lastPromptTokens / contextWindow) * 100) : 0;
    const dynamicWindow = usagePct > HIGH_USAGE_PCT ? HIGH_USAGE_WINDOW : usagePct > MED_USAGE_PCT ? MED_USAGE_WINDOW : SLIDING_WINDOW_SIZE;
    trimOldToolResults(workingMessages, dynamicWindow);

    let response = await boundModel.invoke(workingMessages);

    const hasToolCalls = (response.tool_calls ?? []).length > 0;
    const hasText = typeof response.content === 'string' && response.content.length > 0;

    if (hasToolCalls && !hasText && iteration > 0 && iteration <= MAX_REASONING_REPROMPT_ITERATION) {
      response = await handleReasoningReprompt({ boundModel, eventBus }, workingMessages, response);
    }

    const usageMeta = response.usage_metadata as { input_tokens?: number; total_tokens?: number; output_tokens?: number } | undefined;
    const newPromptTokens = usageMeta?.input_tokens ?? usageMeta?.total_tokens ?? lastPromptTokens;

    if (typeof response.content === 'string' && response.content.length > 0) {
      eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.AGENT, text: response.content });
    }
    eventBus.emit({
      type: 'llm_usage',
      agent: AGENT_NAME.AGENT,
      promptTokens: usageMeta?.input_tokens ?? 0,
      completionTokens: usageMeta?.output_tokens ?? 0,
    });

    return {
      messages: [...workingMessages, response],
      lastPromptTokens: newPromptTokens,
      iteration: iteration + 1,
    };
  };
};

// ── Tool Node ────────────────────────────────────────────────────────────

export const createToolNode = (fetchJsSnippet: FetchJsSnippetFn) => {
  return async (state: InvestigationStateType, config: RunnableConfig): Promise<Partial<InvestigationStateType>> => {
    const { messages, triedActions, iteration } = state;
    const deps = getConfigurable(config);

    const lastMsg = messages[messages.length - 1];
    if (!(lastMsg instanceof AIMessage)) return {};

    const toolCalls = lastMsg.tool_calls ?? [];
    if (toolCalls.length === 0) return {};

    const parallel = toolCalls.filter((tc) => tc.name !== 'finish_investigation' && !isAskUserTool(tc.name));
    const sequential = toolCalls.filter((tc) => tc.name === 'finish_investigation' || isAskUserTool(tc.name));

    const newMessages: BaseMessage[] = [];
    const newTriedActions: TriedAction[] = [];
    let result: FinishResult | null = null;
    let newPhase = state.phase;

    // Parallel tool dispatch
    const parallelResults = await executeParallelTools(parallel, triedActions, iteration, deps, fetchJsSnippet, newPhase);
    for (const r of parallelResults) {
      newMessages.push(r.msg);
      newTriedActions.push(r.tried);
      if (r.phase !== '') newPhase = r.phase;
    }

    // Sequential tool dispatch (finish & ask_user)
    for (const tc of sequential) {
      const args = tc.args as Record<string, unknown>;

      if (tc.name === 'finish_investigation') {
        deps.eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' as InvestigationPhase });
        result = normalizeFinishResult(args);
        newMessages.push(new ToolMessage({ content: 'Report submitted successfully.', tool_call_id: tc.id ?? '' }));
      } else if (isAskUserTool(tc.name)) {
        const question = (args['question'] as string | undefined) ?? 'Need your input';
        const ctx = (args['context'] as string | undefined) ?? '';
        deps.eventBus.emit({ type: 'waiting_for_input', agent: AGENT_NAME.AGENT, prompt: `${question}\n\nContext: ${ctx}` });
        const userResponse = String(interrupt({ question, context: ctx }));
        newMessages.push(new ToolMessage({ content: `User response: ${userResponse}`, tool_call_id: tc.id ?? '' }));
      }
    }

    return { messages: [...messages, ...newMessages], triedActions: newTriedActions, result, phase: newPhase, noToolCount: 0 };
  };
};

// ── After Tools Node ─────────────────────────────────────────────────────

export const afterToolsNode = (state: InvestigationStateType, config: RunnableConfig): Partial<InvestigationStateType> => {
  const { triedActions, iteration } = state;
  const { eventBus } = getConfigurable(config);

  const iterActions = triedActions.filter((a) => a.iteration === iteration - 1);
  const allFailed = iterActions.length > 0 && iterActions.every((a) => !a.success);
  const newStallCount = allFailed ? state.stallCount + 1 : 0;

  if (newStallCount >= MAX_STALL_COUNT) {
    eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: 'Investigation stalled — all recent tools failed' });
    return { stallCount: newStallCount, messages: [...state.messages, new HumanMessage({ content: STALL_FINISH_MESSAGE })] };
  }

  // Stall early warning — nudge agent before hard stop
  if (newStallCount >= STALL_WARNING_THRESHOLD && newStallCount < MAX_STALL_COUNT) {
    return {
      stallCount: newStallCount,
      messages: [...state.messages, new HumanMessage({
        content: '⚠ STALLING — your recent tool calls are failing. Switch to a fundamentally different strategy or call finish_investigation with what you have.',
      })],
    };
  }

  const lastToolMsg = [...state.messages].reverse().find((m) => m instanceof ToolMessage);
  if (lastToolMsg instanceof ToolMessage && typeof lastToolMsg.content === 'string' && (/```yaml\s*\n\s*```/).test(lastToolMsg.content)) {
    return { stallCount: newStallCount, messages: [...state.messages, new HumanMessage({ content: CRASHED_PAGE_GUIDANCE })] };
  }

  const CIRCULAR_COOLDOWN = 5;
  if (detectCircularPattern(triedActions)) {
    const lastCircularIter = state.lastCircularIter;
    if (iteration - lastCircularIter >= CIRCULAR_COOLDOWN) {
      return {
        stallCount: newStallCount,
        lastCircularIter: iteration,
        messages: [...state.messages, new HumanMessage({ content: '⚠ You are repeating the same actions. Try a COMPLETELY different approach or call finish_investigation.' })],
      };
    }
    // Within cooldown — increment stall silently, no FE event spam
    return { stallCount: newStallCount + 1, lastCircularIter: state.lastCircularIter };
  }

  // Budget-aware checkpoint — force self-assessment every N iterations
  if (iteration > 0 && iteration % CHECKPOINT_INTERVAL === 0 && iteration < state.maxIterations - 1) {
    const remaining = state.maxIterations - iteration;
    return {
      stallCount: newStallCount,
      messages: [...state.messages, new HumanMessage({
        content: `⚠️ CHECKPOINT: ${iteration.toString()}/${state.maxIterations.toString()} iterations (${remaining.toString()} remaining).\n`
          + '1. List your current hypotheses and their status (confirmed/testing/rejected).\n'
          + '2. Reject any hypothesis that contradicts evidence gathered so far.\n'
          + '3. If one hypothesis is CONFIRMED → call finish_investigation NOW.\n'
          + '4. If not, state exactly what experiment you will run next and which hypothesis it targets.',
      })],
    };
  }

  return { stallCount: newStallCount };
};

// ── Force Finish Node ────────────────────────────────────────────────────

export const forceFinishNode = (_state: InvestigationStateType, config: RunnableConfig): Partial<InvestigationStateType> => {
  getConfigurable(config).eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' as InvestigationPhase });
  return { messages: [..._state.messages, new HumanMessage({ content: FORCE_FINISH_MESSAGE })] };
};

// ── Emergency Node ───────────────────────────────────────────────────────

export const emergencyNode = (state: InvestigationStateType, config: RunnableConfig): Partial<InvestigationStateType> => {
  const { messages, triedActions } = state;
  const { eventBus } = getConfigurable(config);

  eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: 'Emergency finish — building partial report' });
  eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' as InvestigationPhase });

  const consoleErrors: string[] = [];
  const reasonings: string[] = [];

  for (const msg of messages) {
    if (typeof msg.content !== 'string') continue;

    // Collect reasoning from agent messages for better summary
    if (msg instanceof AIMessage && msg.content.length > 20) {
      reasonings.push(msg.content.slice(0, 300));
    }

    if (msg.content.includes('[compressed:') || msg.content.includes('[truncated')) continue;
    const errors = msg.content.match(ERROR_PATTERN);
    if (errors !== null) {
      for (const err of errors) {
        if (!consoleErrors.includes(err)) consoleErrors.push(err);
      }
    }
  }

  const toolsSummary = [...new Set(triedActions.map((a) => a.tool))].join(', ');
  const hasEvidence = consoleErrors.length > 0;
  const lastReasoning = reasonings.length > 0 ? reasonings[reasonings.length - 1] : undefined;

  return {
    result: {
      summary: hasEvidence
        ? `Investigation exhausted budget. Found ${consoleErrors.length.toString()} error(s). Errors: ${consoleErrors[0] ?? 'unknown'}`
        : lastReasoning !== undefined
          ? `Investigation exhausted budget. Last analysis: ${lastReasoning.slice(0, 200)}`
          : 'Investigation exhausted budget without finding clear errors.',
      rootCause: hasEvidence ? (consoleErrors[0] ?? 'Unknown') : 'Could not determine root cause within budget',
      severity: hasEvidence ? 'medium' : 'low',
      stepsToReproduce: [],
      evidence: { consoleErrors, networkErrors: [] },
      suggestedFix: hasEvidence ? `Review: ${consoleErrors.slice(0, 3).join('; ')}` : undefined,
      networkFindings: [
        `Tools used: ${toolsSummary}`,
        `Total actions: ${triedActions.length.toString()}`,
        ...(reasonings.length > 0 ? [`Agent reasoning fragments: ${reasonings.length.toString()}`] : []),
      ],
    },
  };
};

export const shouldContinue = (state: InvestigationStateType): string => {
  if (state.result !== null) return 'end';

  const lastMsg = state.messages[state.messages.length - 1];
  if (lastMsg === undefined) return 'emergency';

  if (lastMsg instanceof AIMessage) {
    const toolCalls = lastMsg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return state.noToolCount >= MAX_NO_TOOL_RETRIES ? 'emergency' : 'no_tools';
    }
    return 'tools';
  }

  return 'agent';
};

export const shouldContinueAfterTools = (state: InvestigationStateType): string => {
  if (state.result !== null) return 'end';
  if (state.stallCount >= MAX_STALL_COUNT) return 'force_finish';
  if (state.iteration >= state.maxIterations - 1) return 'force_finish';
  return 'agent';
};
