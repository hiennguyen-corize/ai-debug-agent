/**
 * Agent loop — single LLM, single conversation, direct tool calls.
 */

import type OpenAI from 'openai';
import { AGENT_NAME, INVESTIGATION_MODE } from '@ai-debug/shared';
import { buildSystemPrompt } from '#agent/prompts.js';
import { summarizeToolResult } from '#agent/snapshot-summarizer.js';
import { FINISH_TOOL, SOURCE_MAP_TOOLS, ASK_USER_TOOL, FETCH_JS_SNIPPET_TOOL, isSourceMapTool, isAskUserTool, isFetchJsSnippetTool } from '#agent/agent-loop.tools.js';
import { normalizeFinishResult } from '#agent/agent-loop.normalize.js';
import { callLLMWithRetry, parseArgs, stringifyResult, trimOldToolResults } from '#agent/agent-loop.helpers.js';
import type { FinishResult, AgentLoopDeps } from '#agent/agent-loop.types.js';
import { fetchJsSnippet } from '#agent/tools/fetch-js-snippet.js';

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
  const interactiveTools = deps.mode === INVESTIGATION_MODE.INTERACTIVE ? [ASK_USER_TOOL] : [];
  const allTools = [...deps.playwrightTools, FINISH_TOOL, ...SOURCE_MAP_TOOLS, FETCH_JS_SNIPPET_TOOL, ...interactiveTools];

  const userMessage = hint !== null && hint !== ''
    ? `URL: ${url}\nHint: ${hint}`
    : `URL: ${url}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(deps.mode ?? 'autonomous') },
    { role: 'user', content: userMessage },
  ];

  deps.eventBus.emit({ type: 'investigation_phase', phase: 'scouting' });

  type TriedAction = { tool: string; argsKey: string; success: boolean; iteration: number };
  const triedActions: TriedAction[] = [];
  let noToolCount = 0;
  const phaseRef = { value: 'scouting' };

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

    const result = await processToolCalls(deps, message.tool_calls, messages, triedActions, i, phaseRef);
    if (result !== null) return result;

    trimOldToolResults(messages as { role: string; content?: string | null | undefined }[], SLIDING_WINDOW_SIZE);

    const CHECKPOINT_INTERVAL = 10;
    if ((i + 1) % CHECKPOINT_INTERVAL === 0 && i < maxIterations - 1) {
      const remaining = maxIterations - i - 1;
      deps.eventBus.emit({ type: 'investigation_phase', phase: 'reflecting' });
      phaseRef.value = 'reflecting';

      const failedHistory = triedActions
        .filter(a => !a.success)
        .map(a => `- ${a.tool}(${a.argsKey}) at iter ${String(a.iteration)} → FAILED`)
        .join('\n');

      const historySection = failedHistory.length > 0
        ? `\n\n## Previous FAILED actions (do NOT repeat)\n${failedHistory}`
        : '';

      const urgency = remaining <= 10
        ? `\n\n🚨 CRITICAL: Only ${remaining.toString()} iterations left! You MUST call finish_investigation on your NEXT turn unless you have ZERO evidence. Summarize what you know NOW.`
        : remaining <= 20
          ? `\n\n⚠️ WARNING: Budget is > 60% used. You should be wrapping up. If you have a confirmed or likely hypothesis, call finish_investigation NOW.`
          : '';

      messages.push({
        role: 'user',
        content: `⚠️ REFLECTION CHECKPOINT (${(i + 1).toString()}/${maxIterations.toString()} iterations, ${remaining.toString()} remaining)

## 1. REFLECT — What do you know?
- Summarize evidence gathered so far
- Which hypotheses are confirmed/rejected/still testing?

## 2. EVALUATE — Is the current strategy working?
- Are you making progress toward root cause?
- Have you been repeating actions without new insight?

## 3. DECIDE — What next?
- If a hypothesis is CONFIRMED → call finish_investigation NOW
- If stuck → pivot (source maps ↔ network ↔ state inspection)
- State your next 2 tool calls and WHY${urgency}${historySection}`,
      });
    }

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
  triedActions: { tool: string; argsKey: string; success: boolean; iteration: number }[],
  iteration: number,
  phaseRef: { value: string },
): Promise<FinishResult | null> => {
  // Separate terminal (must be sequential) from parallelizable tools
  const parallel: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];
  const sequential: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];

  for (const tc of toolCalls) {
    const name = tc.function.name;

    // Phase transitions based on tool usage
    if (name === 'browser_navigate' && phaseRef.value === 'scouting') {
      phaseRef.value = 'investigating';
      deps.eventBus.emit({ type: 'investigation_phase', phase: 'investigating' });
    } else if (isSourceMapTool(name) && phaseRef.value !== 'source_analysis' && phaseRef.value !== 'reflecting' && phaseRef.value !== 'synthesizing') {
      phaseRef.value = 'source_analysis';
      deps.eventBus.emit({ type: 'investigation_phase', phase: 'source_analysis' });
    }
    if (name === 'finish_investigation' || isAskUserTool(name)) {
      sequential.push(tc);
    } else {
      parallel.push(tc);
    }
  }

  // Execute parallelizable tools concurrently
  if (parallel.length > 0) {
    const settled = await Promise.allSettled(
      parallel.map(async (tc) => {
        const toolName = tc.function.name;
        const args = parseArgs(tc.function.arguments);
        const argsKey = JSON.stringify(args).slice(0, 100);

        // Skip tools that already failed with the same arguments
        const priorFail = triedActions.find(a => a.tool === toolName && a.argsKey === argsKey && !a.success);
        if (priorFail !== undefined) {
          const msg = `Tool ${toolName} already failed with these arguments at iteration ${String(priorFail.iteration)}. Use different parameters or a different approach.`;
          deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.AGENT, tool: toolName, success: false, durationMs: 0, result: msg });
          return { role: 'tool' as const, tool_call_id: tc.id, content: msg };
        }

        deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.AGENT, tool: toolName, args });

        if (isFetchJsSnippetTool(toolName)) {
          const startMs = Date.now();
          const url = typeof args['url'] === 'string' ? args['url'] : '';
          const line = typeof args['line'] === 'number' ? args['line'] : 1;
          const ctx = typeof args['context'] === 'number' ? args['context'] : undefined;
          const snippet = await fetchJsSnippet({ url, line, context: ctx });
          const elapsed = Date.now() - startMs;
          deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.AGENT, tool: toolName, success: true, durationMs: elapsed, result: snippet.length > 2000 ? snippet.slice(0, 2000) + '\n…(truncated)' : snippet });
          triedActions.push({ tool: toolName, argsKey: JSON.stringify(args).slice(0, 100), success: true, iteration });
          return { role: 'tool' as const, tool_call_id: tc.id, content: snippet };
        }

        const { resultStr, success, durationMs } = await executeTool(deps, toolName, args);
        deps.eventBus.emit({
          type: 'tool_result', agent: AGENT_NAME.AGENT, tool: toolName, success, durationMs,
          result: resultStr.length > 2000 ? resultStr.slice(0, 2000) + '\n…(truncated)' : resultStr,
        });
        triedActions.push({ tool: toolName, argsKey: JSON.stringify(args).slice(0, 100), success, iteration });
        return { role: 'tool' as const, tool_call_id: tc.id, content: summarizeToolResult(resultStr) };
      }),
    );

    for (const r of settled) {
      if (r.status === 'fulfilled') {
        messages.push(r.value);
      } else {
        // Find the tool call that failed to get its ID
        const idx = settled.indexOf(r);
        const tc = parallel[idx];
        if (tc !== undefined) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${String(r.reason)}` });
        }
      }
    }
  }

  // Process sequential/terminal tools in order
  for (const toolCall of sequential) {
    const toolName = toolCall.function.name;
    const args = parseArgs(toolCall.function.arguments);

    deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.AGENT, tool: toolName, args });

    if (toolName === 'finish_investigation') {
      deps.eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' });
      return normalizeFinishResult(args);
    }

    if (isAskUserTool(toolName) && deps.messageQueue !== undefined) {
      const question = typeof args['question'] === 'string' ? args['question'] : 'What should I investigate next?';
      const context = typeof args['context'] === 'string' ? args['context'] : '';
      deps.eventBus.emit({ type: 'waiting_for_input', agent: AGENT_NAME.AGENT, prompt: question });
      const answer = await deps.messageQueue.next();
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: `User response: ${answer}` });
      deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.AGENT, tool: toolName, success: true, durationMs: 0, result: `Asked: ${question} (${context}) → User: ${answer}` });
    }
  }

  return null;
};

const RECOVERABLE_PATTERNS = [
  { pattern: /timeout/i, strategy: 'retry' as const },
  { pattern: /navigation/i, strategy: 'retry' as const },
  { pattern: /target closed|page crashed|page has been closed/i, strategy: 'navigate_back' as const },
];

const executeTool = async (
  deps: AgentLoopDeps,
  toolName: string,
  args: Record<string, unknown>,
  retryCount = 0,
): Promise<{ resultStr: string; success: boolean; durationMs: number }> => {
  const startMs = Date.now();
  try {
    const result = isSourceMapTool(toolName)
      ? await deps.mcpCall(toolName, args)
      : await deps.playwrightCall(toolName, args);
    return { resultStr: stringifyResult(result), success: true, durationMs: Date.now() - startMs };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Attempt recovery once for known Playwright failures
    if (retryCount < 1 && !isSourceMapTool(toolName)) {
      const recovery = RECOVERABLE_PATTERNS.find(r => r.pattern.test(errorMsg));
      if (recovery !== undefined) {
        deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: `Recovering from ${toolName}: ${errorMsg} (${recovery.strategy})` });

        if (recovery.strategy === 'navigate_back') {
          try { await deps.playwrightCall('browser_navigate', { url: 'about:blank' }); } catch { /* best effort */ }
        }

        await new Promise<void>(r => { setTimeout(r, 1000); });
        return executeTool(deps, toolName, args, retryCount + 1);
      }
    }

    return { resultStr: `Error: ${errorMsg}`, success: false, durationMs: Date.now() - startMs };
  }
};
