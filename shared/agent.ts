/**
 * Agent event and step types.
 */

import type { Hypothesis } from './hypothesis.js';

export const AGENT_NAME = {
  SCOUT: 'scout',
  INVESTIGATOR: 'investigator',
  EXPLORER: 'explorer',
  SYNTHESIS: 'synthesis',
} as const;

export type AgentName = (typeof AGENT_NAME)[keyof typeof AGENT_NAME];

export const STREAM_LEVEL = {
  SUMMARY: 'summary',
  VERBOSE: 'verbose',
} as const;

export type StreamLevel = (typeof STREAM_LEVEL)[keyof typeof STREAM_LEVEL];

export const INVESTIGATION_PHASE = {
  SCOUTING: 'scouting',
  HYPOTHESIZING: 'hypothesizing',
  INVESTIGATING: 'investigating',
  SOURCE_ANALYSIS: 'source_analysis',
  SYNTHESIZING: 'synthesizing',
} as const;

export type InvestigationPhase = (typeof INVESTIGATION_PHASE)[keyof typeof INVESTIGATION_PHASE];

export type AgentEvent =
  | { type: 'reasoning'; agent: AgentName; text: string }
  | { type: 'tool_call'; agent: AgentName; tool: string; args: unknown }
  | {
      type: 'tool_result';
      agent: AgentName;
      tool: string;
      success: boolean;
      durationMs: number;
    }
  | { type: 'llm_usage'; agent: AgentName; promptTokens: number; completionTokens: number }
  | { type: 'error'; agent: AgentName; message: string }
  | { type: 'hypothesis_created'; hypotheses: Hypothesis[] }
  | {
      type: 'hypothesis_updated';
      id: string;
      oldConfidence: number;
      newConfidence: number;
      status: string;
    }
  | { type: 'sourcemap_resolved'; bundleUrl: string; originalFile: string; line: number }
  | { type: 'sourcemap_failed'; bundleUrl: string; reason: string }
  | { type: 'user_question'; question: string; context: string }
  | { type: 'user_answered'; question: string }
  | { type: 'investigation_phase'; phase: InvestigationPhase }
  | { type: 'screenshot_captured'; agent: AgentName; data: string };

export const STEP_TYPE = {
  THINKING: 'thinking',
  ACTION: 'action',
  RESULT: 'result',
  HYPOTHESIS: 'hypothesis',
  PHASE_CHANGE: 'phase_change',
  ERROR: 'error',
} as const;

export type StepType = (typeof STEP_TYPE)[keyof typeof STEP_TYPE];

export type InvestigationStep = {
  timestamp: string;
  agent: AgentName;
  type: StepType;
  summary: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
};
