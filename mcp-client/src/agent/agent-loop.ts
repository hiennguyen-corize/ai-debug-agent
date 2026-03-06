/**
 * Agent loop — single LLM, single conversation, direct tool calls.
 */

import type OpenAI from 'openai';
import { AGENT_NAME } from '@ai-debug/shared';
import { SYSTEM_PROMPT } from '#agent/prompts.js';
import { summarizeToolResult } from '#agent/snapshot-summarizer.js';
import { FINISH_TOOL, SOURCE_MAP_TOOLS, isSourceMapTool } from '#agent/agent-loop.tools.js';
import { normalizeFinishResult } from '#agent/agent-loop.normalize.js';
import { callLLMWithRetry, parseArgs, stringifyResult, trimOldToolResults } from '#agent/agent-loop.helpers.js';
import type { FinishResult, AgentLoopDeps } from '#agent/agent-loop.types.js';

export type { FinishResult, AgentLoopDeps };

const DEFAULT_MAX_ITERATIONS = 30;
const MAX_NO_TOOL_RETRIES = 3;
const SLIDING_WINDOW_SIZE = 5;

const FORCE_FINISH_MESSAGE = 'You have reached the maximum iterations. You MUST call finish_investigation NOW. If you found a bug, report it. If not, report summary="No bug found", severity="low". Do NOT call any other tool — ONLY finish_investigation.';

export const runAgentLoop = async (
  url: string,
  hint: string | null,
  deps: AgentLoopDeps,
): Promise<FinishResult | null> => {
  const maxIterations = deps.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const allTools = [...deps.playwrightTools, FINISH_TOOL, ...SOURCE_MAP_TOOLS];

  const userMessage = hint !== null && hint !== ''
    ? `URL: ${url}\nHint: ${hint}`
    : `URL: ${url}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  deps.eventBus.emit({ type: 'investigation_phase', phase: 'investigating' });

  let noToolCount = 0;

  for (let i = 0; i < maxIterations; i++) {
    const response = await callLLMWithRetry(deps, messages, allTools);

    const choice = response.choices[0];
    if (choice === undefined) break;
    const message = choice.message;

    emitUsage(deps, response);

    if (message.tool_calls === undefined || message.tool_calls.length === 0) {
      noToolCount++;
      emitReasoning(deps, message.content);
      if (noToolCount >= MAX_NO_TOOL_RETRIES) {
        deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: 'Agent stopped calling tools, ending investigation.' });
        break;
      }
      messages.push(message);
      messages.push({ role: 'user', content: 'Continue by calling the appropriate tools. Do not explain, just call tools.' });
      continue;
    }

    noToolCount = 0;
    emitReasoning(deps, message.content);
    messages.push(message);

    const result = await processToolCalls(deps, message.tool_calls, messages);
    if (result !== null) return result;

    trimOldToolResults(messages as { role: string; content?: string | null | undefined }[], SLIDING_WINDOW_SIZE);

    if (i === maxIterations - 1) {
      messages.push({ role: 'user', content: FORCE_FINISH_MESSAGE });
    }
  }

  return null;
};

const emitUsage = (deps: AgentLoopDeps, response: OpenAI.Chat.ChatCompletion): void => {
  if (response.usage === undefined) return;
  deps.eventBus.emit({
    type: 'llm_usage',
    agent: AGENT_NAME.AGENT,
    promptTokens: response.usage.prompt_tokens,
    completionTokens: response.usage.completion_tokens,
  });
};

const emitReasoning = (deps: AgentLoopDeps, content: string | null): void => {
  if (content === null || content === '') return;
  deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.AGENT, text: content });
};

const processToolCalls = async (
  deps: AgentLoopDeps,
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[],
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): Promise<FinishResult | null> => {
  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    const args = parseArgs(toolCall.function.arguments);

    deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.AGENT, tool: toolName, args });

    if (toolName === 'finish_investigation') {
      deps.eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' });
      return normalizeFinishResult(args);
    }

    const { resultStr, success, durationMs } = await executeTool(deps, toolName, args);

    deps.eventBus.emit({
      type: 'tool_result',
      agent: AGENT_NAME.AGENT,
      tool: toolName,
      success,
      durationMs,
      result: resultStr.length > 2000 ? resultStr.slice(0, 2000) + '\n…(truncated)' : resultStr,
    });

    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: summarizeToolResult(resultStr),
    });
  }
  return null;
};

const executeTool = async (
  deps: AgentLoopDeps,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ resultStr: string; success: boolean; durationMs: number }> => {
  const startMs = Date.now();
  try {
    const result = isSourceMapTool(toolName)
      ? await deps.mcpCall(toolName, args)
      : await deps.playwrightCall(toolName, args);
    return { resultStr: stringifyResult(result), success: true, durationMs: Date.now() - startMs };
  } catch (err) {
    const errorMsg = `Error: ${err instanceof Error ? err.message : String(err)}`;
    return { resultStr: errorMsg, success: false, durationMs: Date.now() - startMs };
  }
};
