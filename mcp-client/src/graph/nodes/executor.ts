/**
 * Executor node — autonomous browser ReAct loop.
 * Receives full context (hint, observations, brief, evidence) and runs
 * @playwright/mcp tools autonomously to investigate bugs.
 */

import {
  INVESTIGATION_STATUS,
  AGENT_NAME,
  CONSOLE_LOG_TYPE,
  type BrowserTaskResult,
  type CapturedLog,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import { buildExecutorMessages } from '#agent/prompts.js';
import { hasToolCalls, extractThinking } from '#agent/tool-parser.js';
import { taskResultToEvidence } from '#graph/nodes/evidence.js';
import type OpenAI from 'openai';

import type { SkillRegistry } from '#agent/skill-registry.js';

type ExecutorDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  playwrightCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
  playwrightTools: OpenAI.Chat.ChatCompletionTool[];
  skillRegistry?: SkillRegistry;
};

// --- Validate tool call against available tools ---

const isValidTool = (name: string, tools: OpenAI.Chat.ChatCompletionTool[]): boolean =>
  tools.some((t) => t.function.name === name);

// --- Extract text from @playwright/mcp result ---

const extractText = (result: unknown): string => {
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    return result
      .filter((item): item is { type: string; text: string } =>
        typeof item === 'object' && item !== null && 'text' in item)
      .map((item) => item.text)
      .join('\n');
  }
  return JSON.stringify(result, null, 2);
};

// --- Execute a single tool call ---

const executeToolCall = async (
  name: string,
  args: Record<string, unknown>,
  deps: ExecutorDeps,
): Promise<string> => {
  // Validate tool exists
  if (!isValidTool(name, deps.playwrightTools)) {
    deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.EXPLORER, message: `Rejected unknown tool: ${name}` });
    return `Error: Tool "${name}" does not exist. Use only available browser tools.`;
  }

  const start = Date.now();
  deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.EXPLORER, tool: name, args });

  try {
    const result = await deps.playwrightCall(name, args);
    const durationMs = Date.now() - start;
    deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.EXPLORER, tool: name, success: true, durationMs });
    return extractText(result);
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.EXPLORER, tool: name, success: false, durationMs });
    return `Error: ${message}`;
  }
};

// --- Main executor ReAct loop ---

const MAX_EXECUTOR_ITERATIONS = 10;

const executeLoop = async (state: AgentState, deps: ExecutorDeps): Promise<BrowserTaskResult> => {
  const observations: string[] = [];
  const consoleLogs: CapturedLog[] = [];
  const messages = buildExecutorMessages(state, deps.playwrightTools, deps.skillRegistry);

  for (let i = 0; i < MAX_EXECUTOR_ITERATIONS; i++) {
    const response = await deps.llmClient.client.chat.completions.create({
      model: deps.llmClient.model,
      messages,
      tools: deps.playwrightTools,
      temperature: 0.1,
    });

    const message = response.choices[0]?.message;
    if (message === undefined) break;

    // No tool calls → executor finished with text summary
    if (!hasToolCalls(message)) {
      if (message.content !== null) {
        observations.push(message.content);
        deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.EXPLORER, text: message.content });
      }
      break;
    }

    // Emit reasoning before tool calls
    const thinking = extractThinking(message);
    if (thinking !== '') {
      deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.EXPLORER, text: thinking });
    } else if (message.content !== null && message.content.trim() !== '') {
      deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.EXPLORER, text: message.content });
    }

    // Execute tool calls
    for (const call of (message.tool_calls ?? [])) {
      const name = call.function.name;
      const args = typeof call.function.arguments === 'string'
        ? JSON.parse(call.function.arguments) as Record<string, unknown>
        : call.function.arguments as Record<string, unknown>;

      const resultStr = await executeToolCall(name, args, deps);
      observations.push(`[${name}] ${resultStr.slice(0, 500)}`);

      // Emit screenshot for inline display
      if (name === 'browser_take_screenshot' || name === 'browser_screenshot') {
        // Result from playwright/mcp contains base64 image data
        const base64Match = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/.exec(resultStr);
        if (base64Match !== null) {
          deps.eventBus.emit({ type: 'screenshot_captured', agent: AGENT_NAME.EXPLORER, data: base64Match[0] });
        }
      }

      // Extract console errors
      if (name === 'browser_console_messages' && resultStr.toLowerCase().includes('error')) {
        consoleLogs.push({
          actionId: `executor-${i.toString()}`,
          type: CONSOLE_LOG_TYPE.ERROR,
          text: resultStr,
          timestamp: Date.now(),
        });
      }

      // Build assistant + tool messages for context
      messages.push({
        role: 'assistant' as const,
        content: null,
        tool_calls: [{
          id: call.id,
          type: 'function' as const,
          function: { name, arguments: JSON.stringify(args) },
        }],
      });
      messages.push({
        role: 'tool' as const,
        tool_call_id: call.id,
        content: resultStr.slice(0, 4000),
      });
    }
  }

  return {
    observations,
    networkActivity: [],
    consoleActivity: consoleLogs,
    screenshotPaths: [],
  };
};

// --- Node export ---

export const createExecutorNode = (deps: ExecutorDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> => {
    if (state.investigationBrief === null) return { status: INVESTIGATION_STATUS.SYNTHESIZING };

    deps.eventBus.emit({ type: 'investigation_phase', phase: 'investigating' });
    const result = await executeLoop(state, deps);

    return {
      browserTaskResults: [...state.browserTaskResults, result],
      evidence: [...state.evidence, ...taskResultToEvidence(result)],
      executorResults: [...state.executorResults, ...result.observations],
      investigationBrief: null, // Clear brief so Planner evaluates next
      status: INVESTIGATION_STATUS.INVESTIGATING,
    };
  };
