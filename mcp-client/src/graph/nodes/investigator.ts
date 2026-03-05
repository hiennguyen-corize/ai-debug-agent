/**
 * Investigator node — central reasoning loop with function calling.
 */

import {
  INVESTIGATION_STATUS,
  AGENT_NAME,
  TOOL_NAME,
  EVIDENCE_CATEGORY,
  EVIDENCE_TYPE,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import type { SkillRegistry } from '#agent/skill-registry.js';
import { buildInvestigatorMessages } from '#agent/prompts.js';
import { parseToolCalls, hasToolCalls, getTextContent, extractThinking } from '#agent/tool-parser.js';
import { INVESTIGATOR_TOOLS } from '#graph/nodes/investigator-tools.js';
import { ToolCallTracker } from '#graph/nodes/tool-call-tracker.js';

type InvestigatorDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
  skillRegistry?: SkillRegistry | undefined;
};

// --- Tool result enrichment ---

const NEXT_STEP_HINTS: Partial<Record<string, string>> = {
  [TOOL_NAME.FETCH_SOURCE_MAP]: '\n\n→ NEXT STEP: Call resolve_error_location with the line and column from the console error to find the original source file.',
  [TOOL_NAME.RESOLVE_ERROR_LOCATION]: '\n\n→ NEXT STEP: Call read_source_file with the file path and line range from above to read the buggy code.',
  [TOOL_NAME.READ_SOURCE_FILE]: '\n\n→ NEXT STEP: You now have the source code. Call finish_investigation with your root cause analysis.',
};

// --- Tool call execution ---

type ToolCallResult = { result: unknown; nextStatus: string | null; isDuplicate: boolean; dupCount: number };

const toolTracker = new ToolCallTracker();

const executeToolCall = async (name: string, args: Record<string, unknown>, deps: InvestigatorDeps): Promise<ToolCallResult> => {
  const cached = toolTracker.getCached(name, args);
  if (cached !== undefined) {
    deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.INVESTIGATOR, tool: name, args });
    deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.INVESTIGATOR, tool: name, success: true, durationMs: 0 });
    return { result: cached.result, nextStatus: null, isDuplicate: true, dupCount: cached.count };
  }

  const start = Date.now();
  deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.INVESTIGATOR, tool: name, args });

  try {
    const result = await deps.mcpCall(name, args);
    deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.INVESTIGATOR, tool: name, success: true, durationMs: Date.now() - start });
    toolTracker.store(name, args, result);

    const nextStatus = name === TOOL_NAME.DISPATCH_BROWSER_TASK ? INVESTIGATION_STATUS.WAITING_EXPLORER
      : name === TOOL_NAME.FINISH_INVESTIGATION ? INVESTIGATION_STATUS.SYNTHESIZING
      : null;
    return { result, nextStatus, isDuplicate: false, dupCount: 1 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.INVESTIGATOR, tool: name, success: false, durationMs: Date.now() - start });
    deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.INVESTIGATOR, message: `Tool ${name} failed: ${message}` });
    return { result: { error: message }, nextStatus: null, isDuplicate: false, dupCount: 0 };
  }
};

// --- Main investigator logic ---

const emitUsage = (deps: InvestigatorDeps, usage: { prompt_tokens: number; completion_tokens: number }): void => {
  deps.eventBus.emit({
    type: 'llm_usage', agent: AGENT_NAME.INVESTIGATOR,
    promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
  });
};

const FORCE_SYNTHESIS_ITERATION = 10;

const invokeInvestigator = async (state: AgentState, deps: InvestigatorDeps): Promise<Partial<AgentState>> => {
  if (state.iterationCount >= FORCE_SYNTHESIS_ITERATION) {
    deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.INVESTIGATOR, text: `Force synthesis: reached ${state.iterationCount.toString()} iterations` });
    return { status: INVESTIGATION_STATUS.SYNTHESIZING, iterationCount: state.iterationCount + 1 };
  }

  deps.eventBus.emit({ type: 'investigation_phase', phase: 'investigating' });

  const response = await deps.llmClient.client.chat.completions.create({
    model: deps.llmClient.model,
    messages: buildInvestigatorMessages(state, deps.skillRegistry),
    tools: INVESTIGATOR_TOOLS,
    temperature: 0.2,
  });

  const message = response.choices[0]?.message;
  if (message === undefined) return { status: INVESTIGATION_STATUS.ERROR };

  const thinking = extractThinking(message);
  if (thinking !== '') deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.INVESTIGATOR, text: thinking });
  const reasoning = getTextContent(message);
  if (reasoning !== '') deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.INVESTIGATOR, text: reasoning });
  if (response.usage) emitUsage(deps, response.usage);

  if (hasToolCalls(message)) {
    const toolCalls = parseToolCalls(message);
    let nextStatus: string | null = null;
    let pendingBrowserTask = state.pendingBrowserTask;
    const toolResults: string[] = [];
    let forceSynthesis = false;

    for (const call of toolCalls) {
      const { result, nextStatus: status, isDuplicate, dupCount } = await executeToolCall(call.name, call.args, deps);
      if (status !== null) nextStatus = status;

      if (isDuplicate && toolTracker.isOverLimit(dupCount)) {
        deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.INVESTIGATOR, text: `Force synthesis: ${call.name} called ${dupCount.toString()} times with same args` });
        forceSynthesis = true;
        break;
      }

      if (call.name === TOOL_NAME.DISPATCH_BROWSER_TASK) {
        pendingBrowserTask = {
          task: call.args['task'] as string,
          lookFor: (call.args['collectEvidence'] as string[] | undefined) ?? [],
          stopCondition: (call.args['stopCondition'] as string | undefined) ?? 'Task complete',
        };
      }

      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const prefix = isDuplicate ? `⚠️ DUPLICATE CALL #${dupCount.toString()} — ` : '';
      const hint = isDuplicate ? '' : (NEXT_STEP_HINTS[call.name] ?? '');
      toolResults.push(`${prefix}[${call.name}] ${resultStr}${hint}`);
    }

    if (forceSynthesis) {
      return { status: INVESTIGATION_STATUS.SYNTHESIZING, iterationCount: state.iterationCount + 1 };
    }

    const newEvidence = toolResults.map((r, i) => ({
      id: `investigator-tool-${state.iterationCount.toString()}-${i.toString()}`,
      hypothesisId: '',
      category: EVIDENCE_CATEGORY.SOURCE,
      type: EVIDENCE_TYPE.SOURCE_CODE,
      description: r.slice(0, 200),
      data: r,
      timestamp: Date.now(),
    }));

    return {
      iterationCount: state.iterationCount + 1,
      evidence: [...state.evidence, ...newEvidence],
      ...(nextStatus !== null ? { status: nextStatus as AgentState['status'] } : {}),
      ...(pendingBrowserTask !== state.pendingBrowserTask ? { pendingBrowserTask } : {}),
    };
  }

  return { iterationCount: state.iterationCount + 1 };
};

export const createInvestigatorNode = (deps: InvestigatorDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> =>
    invokeInvestigator(state, deps);
