/**
 * Control nodes — guardrails for stalling, circular patterns, and emergency finish.
 */

import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AGENT_NAME } from '@ai-debug/shared';
import type { InvestigationPhase } from '@ai-debug/shared';
import type { InvestigationStateType } from '#graph/state.js';
import {
  MAX_STALL_COUNT,
  CIRCULAR_COOLDOWN,
  FORCE_FINISH_MESSAGE,
  STALL_FINISH_MESSAGE,
  CRASHED_PAGE_GUIDANCE,
  ERROR_PATTERN,
  CHECKPOINT_INTERVAL,
  STALL_WARNING_THRESHOLD,
} from '#graph/constants.js';
import { getConfigurable, detectCircularPattern } from '#graph/helpers.js';

type PartialState = Partial<InvestigationStateType>;
type EventBus = ReturnType<typeof getConfigurable>['eventBus'];

const computeStallCount = (state: InvestigationStateType): number => {
  const iterActions = state.triedActions.filter((a) => a.iteration === state.iteration - 1);
  const allFailed = iterActions.length > 0 && iterActions.every((a) => !a.success);
  return allFailed ? state.stallCount + 1 : 0;
};

const checkStallCondition = (state: InvestigationStateType, stallCount: number, eventBus: EventBus): PartialState | null => {
  if (stallCount >= MAX_STALL_COUNT) {
    eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: 'Investigation stalled — all recent tools failed' });
    return { stallCount, messages: [...state.messages, new HumanMessage({ content: STALL_FINISH_MESSAGE })] };
  }

  if (stallCount >= STALL_WARNING_THRESHOLD && stallCount < MAX_STALL_COUNT) {
    return {
      stallCount,
      messages: [...state.messages, new HumanMessage({
        content: '⚠ STALLING — your recent tool calls are failing. Switch to a fundamentally different strategy or call finish_investigation with what you have.',
      })],
    };
  }

  return null;
};

const checkCrashedPage = (state: InvestigationStateType, stallCount: number): PartialState | null => {
  const lastToolMsg = [...state.messages].reverse().find((m) => m instanceof ToolMessage);
  if (lastToolMsg instanceof ToolMessage && typeof lastToolMsg.content === 'string' && (/```yaml\s*\n\s*```/).test(lastToolMsg.content)) {
    return { stallCount, messages: [...state.messages, new HumanMessage({ content: CRASHED_PAGE_GUIDANCE })] };
  }
  return null;
};

const checkCircularOrCheckpoint = (state: InvestigationStateType, stallCount: number): PartialState | null => {
  const { triedActions, iteration, maxIterations, lastCircularIter } = state;

  if (detectCircularPattern(triedActions)) {
    if (iteration - lastCircularIter >= CIRCULAR_COOLDOWN) {
      return {
        stallCount,
        lastCircularIter: iteration,
        messages: [...state.messages, new HumanMessage({ content: '⚠ You are repeating the same actions. Try a COMPLETELY different approach or call finish_investigation.' })],
      };
    }
    return { stallCount: stallCount + 1, lastCircularIter };
  }

  if (iteration > 0 && iteration % CHECKPOINT_INTERVAL === 0 && iteration < maxIterations - 1) {
    const remaining = maxIterations - iteration;
    return {
      stallCount,
      messages: [...state.messages, new HumanMessage({
        content: `⚠️ CHECKPOINT: ${iteration.toString()}/${maxIterations.toString()} iterations (${remaining.toString()} remaining).\n`
          + '1. List your current hypotheses and their status (confirmed/testing/rejected).\n'
          + '2. Reject any hypothesis that contradicts evidence gathered so far.\n'
          + '3. If one hypothesis is CONFIRMED → call finish_investigation NOW.\n'
          + '4. If not, state exactly what experiment you will run next and which hypothesis it targets.',
      })],
    };
  }

  return null;
};

export const afterToolsNode = (state: InvestigationStateType, config: RunnableConfig): PartialState => {
  const { eventBus } = getConfigurable(config);
  const stallCount = computeStallCount(state);

  return checkStallCondition(state, stallCount, eventBus)
    ?? checkCrashedPage(state, stallCount)
    ?? checkCircularOrCheckpoint(state, stallCount)
    ?? { stallCount };
};

type EmergencyEvidence = {
  consoleErrors: string[];
  reasonings: string[];
  toolsSummary: string;
};

const extractEmergencyEvidence = (state: InvestigationStateType): EmergencyEvidence => {
  const consoleErrors: string[] = [];
  const reasonings: string[] = [];

  for (const msg of state.messages) {
    if (typeof msg.content !== 'string') continue;
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

  return {
    consoleErrors,
    reasonings,
    toolsSummary: [...new Set(state.triedActions.map((a) => a.tool))].join(', '),
  };
};

export const emergencyNode = (state: InvestigationStateType, config: RunnableConfig): PartialState => {
  const { eventBus } = getConfigurable(config);
  eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: 'Emergency finish — building partial report' });
  eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' as InvestigationPhase });

  const { consoleErrors, reasonings, toolsSummary } = extractEmergencyEvidence(state);
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
        `Total actions: ${state.triedActions.length.toString()}`,
        ...(reasonings.length > 0 ? [`Agent reasoning fragments: ${reasonings.length.toString()}`] : []),
      ],
    },
  };
};

export const forceFinishNode = (_state: InvestigationStateType, config: RunnableConfig): PartialState => {
  getConfigurable(config).eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' as InvestigationPhase });
  return { messages: [..._state.messages, new HumanMessage({ content: FORCE_FINISH_MESSAGE })] };
};
