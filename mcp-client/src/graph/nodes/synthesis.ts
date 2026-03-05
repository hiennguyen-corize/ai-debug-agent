/**
 * Synthesis node — produce final investigation report.
 */

import {
  INVESTIGATION_STATUS,
  AGENT_NAME,
  REPORT_SEVERITY,
  type InvestigationReport,
  type ReportSeverity,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import { buildSynthesisMessages } from '#agent/prompts.js';
import type { SkillRegistry } from '#agent/skill-registry.js';

type SynthesisDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  startTime: number;
  supportsVision?: boolean;
  skillRegistry?: SkillRegistry;
};

const buildSummaryContext = (state: AgentState): string => {
  const parts: string[] = [`URL: ${state.url}`];
  if (state.hint !== null) parts.push(`Hint: ${state.hint}`);

  // Raw console errors from Scout (CRITICAL — prevents hallucination)
  if (state.initialObservations !== null && state.initialObservations.consoleErrors.length > 0) {
    parts.push(`Console Errors (from Scout):\n${state.initialObservations.consoleErrors.join('\n')}`);
  }

  // Explorer observations (browser task results)
  if (state.browserTaskResults.length > 0) {
    const obs = state.browserTaskResults.flatMap((r) => r.observations);
    parts.push(`Explorer Observations:\n${obs.join('\n')}`);

    const consoleFromExplorer = state.browserTaskResults.flatMap((r) => r.consoleActivity).map((l) => l.text);
    if (consoleFromExplorer.length > 0) {
      parts.push(`Console Errors (from Explorer):\n${consoleFromExplorer.join('\n')}`);
    }
  }

  // Evidence details (not just count)
  if (state.evidence.length > 0) {
    const details = state.evidence.map((e) => `[${e.type}] ${e.description}`).join('\n');
    parts.push(`Evidence (${state.evidence.length.toString()} items):\n${details}`);
  }

  parts.push(`Hypotheses: ${JSON.stringify(state.hypotheses, null, 2)}`);

  if (state.codeAnalysis !== null) {
    parts.push(`Code analysis: ${JSON.stringify(state.codeAnalysis, null, 2)}`);
  } else {
    parts.push('Source map: UNAVAILABLE — report MUST be based on observed errors only. Do NOT fabricate file names or variable names.');
  }

  if (state.assumptions.length > 0) parts.push(`Assumptions: ${state.assumptions.join(', ')}`);
  return parts.join('\n\n');
};

const collectScreenshots = (state: AgentState): string[] =>
  state.browserTaskResults.flatMap((r) => r.screenshotPaths).filter((s) => s.length > 0);

const invokeLLM = async (context: string, state: AgentState, deps: SynthesisDeps): Promise<string> => {
  const messages = buildSynthesisMessages(state, context, deps.skillRegistry);

  // If vision is supported, append screenshots as image content
  const screenshots = deps.supportsVision === true ? collectScreenshots(state) : [];
  if (screenshots.length > 0) {
    const lastMsg = messages.at(-1);
    if (lastMsg?.role === 'user') {
      lastMsg.content = [
        { type: 'text' as const, text: typeof lastMsg.content === 'string' ? lastMsg.content : context },
        ...screenshots.map((s) => ({
          type: 'image_url' as const,
          image_url: { url: s.startsWith('data:') ? s : `data:image/png;base64,${s}` },
        })),
      ];
    }
  }

  const response = await deps.llmClient.client.chat.completions.create({
    model: deps.llmClient.model,
    messages: messages as Parameters<typeof deps.llmClient.client.chat.completions.create>[0]['messages'],
    temperature: 0.1,
  });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return response.choices[0]?.message?.content ?? '';
};

// --- Structured output parser ---

type ParsedSections = {
  rootCause: string;
  reproSteps: string[];
  severity: string;
  assumptions: string[];
  fullContent: string;
};

const extractSection = (content: string, header: string): string => {
  const pattern = new RegExp(`## ${header}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = pattern.exec(content);
  return match?.[1]?.trim() ?? '';
};

const parseSeverity = (raw: string): ReportSeverity => {
  const lower = raw.toLowerCase();
  if (lower.includes('critical')) return REPORT_SEVERITY.CRITICAL;
  if (lower.includes('high')) return REPORT_SEVERITY.HIGH;
  if (lower.includes('low')) return REPORT_SEVERITY.LOW;
  return REPORT_SEVERITY.MEDIUM;
};

export const parseLLMSections = (content: string): ParsedSections => {
  const rootCause = extractSection(content, 'Root Cause') || content.slice(0, 500);
  const reproRaw = extractSection(content, 'Reproduction Steps');
  const reproSteps = reproRaw
    .split('\n')
    .map((l) => l.replace(/^\d+\.\s*/, '').trim())
    .filter((l) => l.length > 0);
  const severity = extractSection(content, 'Severity');
  const assumptionsRaw = extractSection(content, 'Assumptions');
  const assumptions = assumptionsRaw
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter((l) => l.length > 0);

  return { rootCause, reproSteps, severity, assumptions, fullContent: content };
};

// --- Report builder ---

const buildReport = (content: string, state: AgentState, deps: SynthesisDeps): InvestigationReport => {
  const parsed = parseLLMSections(content);
  return {
    summary: parsed.rootCause.slice(0, 500),
    rootCause: parsed.rootCause,
    codeLocation: state.codeAnalysis?.errorLocation ?? null,
    dataFlow: state.codeAnalysis?.dataFlow.rootCause ?? '',
    suggestedFix: state.codeAnalysis?.suggestedFix ?? null,
    reproSteps: parsed.reproSteps.length > 0 ? parsed.reproSteps : [],
    evidence: state.evidence,
    hypotheses: state.hypotheses,
    severity: parseSeverity(parsed.severity),
    cannotDetermine: state.status === INVESTIGATION_STATUS.CANNOT_DETERMINE,
    assumptions: parsed.assumptions.length > 0 ? parsed.assumptions : state.assumptions,
    timestamp: new Date().toISOString(),
    url: state.url,
    durationMs: Date.now() - deps.startTime,
  };
};

export const createSynthesisNode = (deps: SynthesisDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> => {
    deps.eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' });
    const content = await invokeLLM(buildSummaryContext(state), state, deps);
    deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.SYNTHESIS, text: content });
    return { finalReport: buildReport(content, state, deps), status: INVESTIGATION_STATUS.DONE };
  };
