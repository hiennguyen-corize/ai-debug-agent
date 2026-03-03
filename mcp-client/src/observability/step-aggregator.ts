/**
 * Step aggregator — transforms raw AgentEvent → InvestigationStep.
 */

import {
  AGENT_NAME,
  STEP_TYPE,
  STREAM_LEVEL,
  type AgentEvent,
  type InvestigationStep,
  type StreamLevel,
  type StepType,
} from '@ai-debug/shared';

const TRUNCATE_LENGTH = 100;

const SUMMARY_TYPES = new Set<StepType>([
  STEP_TYPE.PHASE_CHANGE,
  STEP_TYPE.HYPOTHESIS,
  STEP_TYPE.RESULT,
  STEP_TYPE.ERROR,
]);

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}…`;

const now = (): string => new Date().toISOString();

const aggregateReasoning = (event: Extract<AgentEvent, { type: 'reasoning' }>): InvestigationStep => ({
  timestamp: now(),
  agent: event.agent,
  type: STEP_TYPE.THINKING,
  summary: truncate(event.text, TRUNCATE_LENGTH),
  detail: event.text,
});

const aggregateToolCall = (event: Extract<AgentEvent, { type: 'tool_call' }>): InvestigationStep => ({
  timestamp: now(),
  agent: event.agent,
  type: STEP_TYPE.ACTION,
  summary: `🔧 ${event.tool}`,
  metadata: { tool: event.tool, args: event.args },
});

const aggregateToolResult = (event: Extract<AgentEvent, { type: 'tool_result' }>): InvestigationStep => ({
  timestamp: now(),
  agent: event.agent,
  type: STEP_TYPE.RESULT,
  summary: `${event.success ? '✓' : '✗'} ${event.tool} (${event.durationMs.toString()}ms)`,
  metadata: { success: event.success, durationMs: event.durationMs },
});

const aggregateHypothesis = (event: Extract<AgentEvent, { type: 'hypothesis_created' }>): InvestigationStep => ({
  timestamp: now(),
  agent: AGENT_NAME.INVESTIGATOR,
  type: STEP_TYPE.HYPOTHESIS,
  summary: event.hypotheses.map((h) => `[${h.confidence.toString()}] ${h.statement}`).join(' | '),
  metadata: { hypotheses: event.hypotheses },
});

const aggregatePhase = (event: Extract<AgentEvent, { type: 'investigation_phase' }>): InvestigationStep => ({
  timestamp: now(),
  agent: AGENT_NAME.INVESTIGATOR,
  type: STEP_TYPE.PHASE_CHANGE,
  summary: `Phase → ${event.phase.toUpperCase()}`,
  metadata: { phase: event.phase },
});

const aggregateError = (event: Extract<AgentEvent, { type: 'error' }>): InvestigationStep => ({
  timestamp: now(),
  agent: event.agent,
  type: STEP_TYPE.ERROR,
  summary: event.message,
});

const aggregateFallback = (event: AgentEvent): InvestigationStep => ({
  timestamp: now(),
  agent: 'agent' in event ? (event as { agent: string }).agent as InvestigationStep['agent'] : AGENT_NAME.INVESTIGATOR,
  type: STEP_TYPE.RESULT,
  summary: event.type,
  metadata: { raw: event },
});

export const aggregateEvent = (event: AgentEvent): InvestigationStep => {
  switch (event.type) {
    case 'reasoning': return aggregateReasoning(event);
    case 'tool_call': return aggregateToolCall(event);
    case 'tool_result': return aggregateToolResult(event);
    case 'hypothesis_created': return aggregateHypothesis(event);
    case 'investigation_phase': return aggregatePhase(event);
    case 'error': return aggregateError(event);
    default: return aggregateFallback(event);
  }
};

export const shouldStream = (step: InvestigationStep, level: StreamLevel): boolean => {
  if (level === STREAM_LEVEL.VERBOSE) return true;
  return SUMMARY_TYPES.has(step.type);
};
