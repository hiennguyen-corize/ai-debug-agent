/**
 * Synthesis node — produce final investigation report.
 */

import {
  INVESTIGATION_STATUS,
  AGENT_NAME,
  REPORT_SEVERITY,
  type InvestigationReport,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import { SYNTHESIS_SYSTEM_PROMPT } from '#agent/prompts.js';

type SynthesisDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  startTime: number;
};

const buildSummaryContext = (state: AgentState): string => {
  const parts: string[] = [`URL: ${state.url}`];
  if (state.hint !== null) parts.push(`Hint: ${state.hint}`);
  parts.push(`Hypotheses: ${JSON.stringify(state.hypotheses, null, 2)}`);
  parts.push(`Evidence count: ${state.evidence.length.toString()}`);
  if (state.codeAnalysis !== null) parts.push(`Code analysis: ${JSON.stringify(state.codeAnalysis, null, 2)}`);
  if (state.assumptions.length > 0) parts.push(`Assumptions: ${state.assumptions.join(', ')}`);
  return parts.join('\n\n');
};

const invokeLLM = async (context: string, deps: SynthesisDeps): Promise<string> => {
  const response = await deps.llmClient.client.chat.completions.create({
    model: deps.llmClient.model,
    messages: [
      { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
      { role: 'user', content: context },
    ] as Parameters<typeof deps.llmClient.client.chat.completions.create>[0]['messages'],
    temperature: 0.1,
  });
  return response.choices[0]?.message?.content ?? '';
};

const buildReport = (content: string, state: AgentState, deps: SynthesisDeps): InvestigationReport => ({
  summary: content.slice(0, 500),
  rootCause: content,
  codeLocation: state.codeAnalysis?.errorLocation ?? null,
  dataFlow: state.codeAnalysis?.dataFlow.rootCause ?? '',
  suggestedFix: state.codeAnalysis?.suggestedFix ?? null,
  reproSteps: [],
  evidence: state.evidence,
  hypotheses: state.hypotheses,
  severity: REPORT_SEVERITY.MEDIUM,
  cannotDetermine: state.status === INVESTIGATION_STATUS.CANNOT_DETERMINE,
  assumptions: state.assumptions,
  timestamp: new Date().toISOString(),
  url: state.url,
  durationMs: Date.now() - deps.startTime,
});

export const createSynthesisNode = (deps: SynthesisDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> => {
    deps.eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' });
    const content = await invokeLLM(buildSummaryContext(state), deps);
    deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.SYNTHESIS, text: content });
    return { finalReport: buildReport(content, state, deps), status: INVESTIGATION_STATUS.DONE };
  };
