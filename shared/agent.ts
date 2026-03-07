/**
 * Agent event and step types.
 */

export const AGENT_NAME = {
  AGENT: 'agent',
} as const;

export type AgentName = (typeof AGENT_NAME)[keyof typeof AGENT_NAME];

export const STREAM_LEVEL = {
  SUMMARY: 'summary',
  VERBOSE: 'verbose',
} as const;

export type StreamLevel = (typeof STREAM_LEVEL)[keyof typeof STREAM_LEVEL];

export const INVESTIGATION_PHASE = {
  SCOUTING: 'scouting',
  INVESTIGATING: 'investigating',
  SOURCE_ANALYSIS: 'source_analysis',
  REFLECTING: 'reflecting',
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
      result?: string;
    }
  | { type: 'llm_usage'; agent: AgentName; promptTokens: number; completionTokens: number }
  | { type: 'error'; agent: AgentName; message: string }
  | { type: 'sourcemap_resolved'; bundleUrl: string; originalFile: string; line: number }
  | { type: 'sourcemap_failed'; bundleUrl: string; reason: string }
  | { type: 'investigation_phase'; phase: InvestigationPhase }
  | { type: 'investigation_queued'; position: number; message: string }
  | { type: 'screenshot_captured'; agent: AgentName; data: string }
  | { type: 'waiting_for_input'; agent: AgentName; prompt: string };

export const STEP_TYPE = {
  THINKING: 'thinking',
  ACTION: 'action',
  RESULT: 'result',
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
};
