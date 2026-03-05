/**
 * Planner node — writes natural language investigation brief.
 * Called once per round. Outputs brief for Executor, or decides to synthesize.
 */

import {
  INVESTIGATION_STATUS,
  AGENT_NAME,
  TOOL_NAME,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import type { SkillRegistry } from '#agent/skill-registry.js';
import { extractThinking, getTextContent } from '#agent/tool-parser.js';
import { buildPlannerMessages, PLANNER_TOOLS } from '#agent/prompts.js';

type PlannerDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
  skillRegistry?: SkillRegistry | undefined;
};

export const createPlannerNode = (deps: PlannerDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> => {
    deps.eventBus.emit({ type: 'investigation_phase', phase: 'investigating' });

    const response = await deps.llmClient.client.chat.completions.create({
      model: deps.llmClient.model,
      messages: buildPlannerMessages(state, deps.skillRegistry),
      tools: PLANNER_TOOLS,
      temperature: 0.2,
    });

    const message = response.choices[0]?.message;
    if (message === undefined) return { status: INVESTIGATION_STATUS.ERROR };

    // Emit reasoning
    const thinking = extractThinking(message);
    if (thinking !== '') deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.INVESTIGATOR, text: thinking });
    const reasoning = getTextContent(message);
    if (reasoning !== '') deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.INVESTIGATOR, text: reasoning });

    if (response.usage) {
      deps.eventBus.emit({
        type: 'llm_usage', agent: AGENT_NAME.INVESTIGATOR,
        promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens,
      });
    }

    // Check for tool calls: finish_investigation or source_map tools
    if (message.tool_calls !== undefined && message.tool_calls.length > 0) {
      for (const call of message.tool_calls) {
        const name = call.function.name;
        const args = typeof call.function.arguments === 'string'
          ? JSON.parse(call.function.arguments) as Record<string, unknown>
          : call.function.arguments as Record<string, unknown>;

        deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.INVESTIGATOR, tool: name, args });

        if (name === TOOL_NAME.FINISH_INVESTIGATION) {
          return { status: INVESTIGATION_STATUS.SYNTHESIZING, plannerRound: state.plannerRound + 1 };
        }

        // Source map analysis tools — execute and store evidence
        if (name === TOOL_NAME.FETCH_SOURCE_MAP || name === TOOL_NAME.RESOLVE_ERROR_LOCATION || name === TOOL_NAME.READ_SOURCE_FILE) {
          try {
            const result = await deps.mcpCall(name, args);
            deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.INVESTIGATOR, tool: name, success: true, durationMs: 0 });
            return {
              status: INVESTIGATION_STATUS.SOURCE_ANALYSIS,
              executorResults: [...state.executorResults, `[${name}] ${JSON.stringify(result)}`],
              plannerRound: state.plannerRound + 1,
            };
          } catch {
            deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.INVESTIGATOR, tool: name, success: false, durationMs: 0 });
          }
        }
      }
    }

    // No tool calls → LLM returned text = investigation brief
    const brief = reasoning || thinking || 'Investigate the page for bugs.';
    deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.INVESTIGATOR, text: `Brief for executor: ${brief.slice(0, 200)}` });

    return {
      investigationBrief: brief,
      plannerRound: state.plannerRound + 1,
    };
  };
