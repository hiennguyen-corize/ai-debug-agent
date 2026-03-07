/**
 * Agent loop — single LLM, single conversation, direct tool calls.
 */

import type OpenAI from 'openai';
import { AGENT_NAME, INVESTIGATION_MODE } from '@ai-debug/shared';
import { buildSystemPrompt } from '#agent/loop/prompts.js';
import { summarizeToolResult } from '#agent/loop/snapshot-summarizer.js';
import { FINISH_TOOL, ASK_USER_TOOL, FETCH_JS_SNIPPET_TOOL, SOURCE_MAP_TOOLS, isSourceMapTool, isAskUserTool, isFetchJsSnippetTool } from '#agent/loop/tools.js';
import { normalizeFinishResult } from '#agent/loop/normalize.js';
import { callLLMWithRetry, parseArgs, stringifyResult, trimOldToolResults } from '#agent/loop/helpers.js';
import type { FinishResult, AgentLoopDeps } from '#agent/loop/types.js';
import { fetchJsSnippet } from '#agent/tools/fetch-js-snippet.js';

export type { FinishResult, AgentLoopDeps };

const DEFAULT_MAX_ITERATIONS = 30;
const MAX_NO_TOOL_RETRIES = 3;
const SLIDING_WINDOW_SIZE = 5;
const STALL_THRESHOLD = 3;
const MAX_STALL_COUNT = 5;

type TriedAction = { tool: string; argsKey: string; sig: string; success: boolean; iteration: number };

const toArgsKey = (args: Record<string, unknown>): string =>
  JSON.stringify(args).slice(0, 100);

const buildActionSig = (toolName: string, args: Record<string, unknown>): string => {
  if (toolName === 'browser_navigate') {
    const url = typeof args['url'] === 'string' ? args['url'] : '';
    try { return `nav:${new URL(url, 'http://x').pathname}`; } catch { return `nav:${url}`; }
  }
  if (toolName === 'browser_click') {
    const ref = typeof args['ref'] === 'string' ? args['ref'] : typeof args['selector'] === 'string' ? args['selector'] : '';
    return `click:${ref}`;
  }
  if (toolName === 'browser_type') {
    const ref = typeof args['ref'] === 'string' ? args['ref'] : '';
    const text = typeof args['text'] === 'string' ? args['text'] : '';
    return `type:${ref}:${text}`;
  }
  return `${toolName}:${JSON.stringify(args).slice(0, 60)}`;
};

const detectCircularPattern = (triedActions: TriedAction[]): { detected: boolean; pattern?: string } => {
  if (triedActions.length < 6) return { detected: false };

  const sigs = triedActions.map(a => a.sig);

  // Check repeated sequences of length 2–5
  for (let len = 2; len <= 5; len++) {
    if (sigs.length < len * 2) continue;
    const tail = sigs.slice(-len * 2);
    const first = tail.slice(0, len).join('|');
    const second = tail.slice(len).join('|');
    if (first === second) {
      return { detected: true, pattern: first };
    }
  }

  // Fallback: uniqueRatio over 20 recent actions (wider than before)
  const window = sigs.slice(-20);
  if (window.length >= 10) {
    const uniqueRatio = new Set(window).size / window.length;
    if (uniqueRatio < 0.35) {
      return { detected: true, pattern: `low-unique:${uniqueRatio.toFixed(2)}` };
    }
  }

  return { detected: false };
};

const MAX_SAME_SIG_FAILURES = 3;

const getConsecutiveSigFailures = (triedActions: TriedAction[], sig: string): number => {
  let count = 0;
  for (let i = triedActions.length - 1; i >= 0; i--) {
    const a = triedActions[i];
    if (a === undefined) continue;
    if (a.sig === sig && !a.success) count++;
    else if (a.sig === sig && a.success) break;
  }
  return count;
};

const FORCE_FINISH_MESSAGE = 'You have reached the maximum iterations. You MUST call finish_investigation NOW. If you found a bug, report it. If not, report summary="No bug found", severity="low". Do NOT call any other tool — ONLY finish_investigation.';

const STALL_FINISH_MESSAGE = 'You have made no progress for multiple consecutive iterations. All recent tool calls have failed. You MUST call finish_investigation NOW with whatever evidence you have gathered so far. Do NOT call any other tool — ONLY finish_investigation.';

const CRASHED_PAGE_GUIDANCE = 'The page appears crashed or empty (blank snapshot). If you already have error evidence from previous steps, call finish_investigation NOW with what you have. Do NOT re-navigate to reproduce — use the evidence you already collected.';


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


  const triedActions: TriedAction[] = [];
  let noToolCount = 0;
  const phaseRef = { value: 'scouting' };

  const contextWindow = deps.contextWindow ?? 128_000;
  let lastPromptTokens = 0;
  let stallCount = 0;

  for (let i = 0; i < maxIterations; i++) {
    try {
      // Continuous budget awareness — inject token usage before LLM call
      const failedList = triedActions
        .filter(a => !a.success)
        .map(a => `${a.tool}(${a.argsKey})`)
        .slice(-5);
      const usagePct = Math.round((lastPromptTokens / contextWindow) * 100);
      const budgetContext = `[Context: ${lastPromptTokens.toLocaleString()}/${contextWindow.toLocaleString()} tokens (${usagePct.toString()}%)]`
        + (failedList.length > 0 ? ` [Failed: ${failedList.join(', ')}]` : '')
        + (stallCount >= STALL_THRESHOLD ? ` [⚠ STALLED: ${stallCount.toString()} iterations with no progress — switch approach or finish]` : '');

      const budgetTag = '<!--budget-->';
      const existingIdx = messages.findIndex(m => m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(budgetTag));
      const budgetMsg: OpenAI.Chat.ChatCompletionMessageParam = { role: 'user', content: `${budgetTag}${budgetContext}` };
      if (existingIdx >= 0) {
        messages[existingIdx] = budgetMsg;
      } else {
        messages.splice(1, 0, budgetMsg);
      }

      const response = await callLLMWithRetry(deps, messages, allTools);

      const choice = response.choices[0];
      if (choice === undefined) {
        deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: `[EXIT] LLM returned empty choices at iteration ${String(i)}` });
        break;
      }
      const message = choice.message;

      // Track actual token usage for next iteration's budget
      lastPromptTokens = response.usage?.prompt_tokens ?? lastPromptTokens;

      emitUsage(deps, response);

      if (message.tool_calls === undefined || message.tool_calls.length === 0) {
        noToolCount++;
        emitReasoning(deps, message.content);
        if (noToolCount >= MAX_NO_TOOL_RETRIES) {
          deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: `[EXIT] Agent stopped calling tools after ${String(MAX_NO_TOOL_RETRIES)} retries, ending investigation.` });
          break;
        }
        deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: `[WARN] No tool calls (${String(noToolCount)}/${String(MAX_NO_TOOL_RETRIES)}), prompting agent to continue` });
        messages.push(message);
        messages.push({ role: 'user', content: 'Continue by calling the appropriate tools. Do not explain, just call tools.' });
        continue;
      }

      noToolCount = 0;
      emitReasoning(deps, message.content);
      messages.push(message);

      const result = await processToolCalls(message.tool_calls, { deps, messages, triedActions, iteration: i, phaseRef });
      if (result !== null) return result;

      // Proactive context management — shrink window as context fills
      const dynamicWindow = usagePct > 75 ? 1 : usagePct > 50 ? 3 : SLIDING_WINDOW_SIZE;
      trimOldToolResults(messages as { role: string; content?: string | null | undefined }[], dynamicWindow);

      // Stall detection — consecutive iterations with all tools failing
      const iterActions = triedActions.filter(a => a.iteration === i);
      const allFailed = iterActions.length > 0 && iterActions.every(a => !a.success);
      stallCount = allFailed ? stallCount + 1 : 0;

      if (stallCount >= MAX_STALL_COUNT) {
        deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: `[EXIT] Stalled for ${String(stallCount)} iterations, forcing finish` });
        deps.eventBus.emit({ type: 'investigation_phase', phase: 'reflecting' });
        phaseRef.value = 'reflecting';
        messages.push({ role: 'user', content: STALL_FINISH_MESSAGE });
      }

      // Crash state detection — empty page snapshot means DOM is dead
      const lastMsg = messages.at(-1);
      if (lastMsg !== undefined && 'content' in lastMsg && typeof lastMsg.content === 'string') {
        const content = lastMsg.content;
        if (content.includes('### Snapshot') && /```yaml\s*\n\s*```/.test(content)) {
          messages.push({ role: 'user', content: CRASHED_PAGE_GUIDANCE });
        }
      }

      // Circular pattern detection — sequence matching + wide uniqueRatio
      const circular = detectCircularPattern(triedActions);
      if (circular.detected) {
        deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: `[LOOP] Circular pattern detected: ${circular.pattern ?? 'unknown'}` });
        messages.push({
          role: 'user',
          content: `⚠️ LOOP DETECTED: pattern "${circular.pattern ?? 'repeating'}" is repeating. `
            + 'You MUST either: (1) try a fundamentally different approach, or (2) call finish_investigation with the evidence you have. '
            + 'Do NOT retry the same sequence again.',
        });
      }

      // Safety net: force finish on last iteration
      if (i === maxIterations - 1) {
        deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: `[EXIT] Reached max iterations (${String(maxIterations)}), forcing finish` });
        deps.eventBus.emit({ type: 'investigation_phase', phase: 'reflecting' });
        phaseRef.value = 'reflecting';
        messages.push({ role: 'user', content: FORCE_FINISH_MESSAGE });
      }
    } catch (loopErr) {
      const errMsg = loopErr instanceof Error ? loopErr.message : String(loopErr);
      const errStack = loopErr instanceof Error ? loopErr.stack ?? '' : '';
      deps.eventBus.emit({
        type: 'error',
        agent: AGENT_NAME.AGENT,
        message: `[CRASH] Agent loop error at iteration ${String(i)}: ${errMsg}\n${errStack}`,
      });
      // Don't break — try emergency finish below
      break;
    }
  }

  // Emergency finish — never return null, always produce partial report
  deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: `[EMERGENCY] Loop ended without finish_investigation. Actions: ${String(triedActions.length)}, Messages: ${String(messages.length)}` });
  deps.eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' });
  return buildEmergencyResult(triedActions, messages);
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

type ProcessToolCallsCtx = {
  deps: AgentLoopDeps;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  triedActions: TriedAction[];
  iteration: number;
  phaseRef: { value: string };
};

const processToolCalls = async (
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[],
  ctx: ProcessToolCallsCtx,
): Promise<FinishResult | null> => {
  const { deps, messages, triedActions, iteration, phaseRef } = ctx;

  const parallel: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];
  const sequential: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];

  for (const toolCall of toolCalls) {
    const name = toolCall.function.name;

    // Phase transitions based on tool usage
    if (name === 'browser_navigate' && phaseRef.value === 'scouting') {
      phaseRef.value = 'investigating';
      deps.eventBus.emit({ type: 'investigation_phase', phase: 'investigating' });
    } else if (isSourceMapTool(name) && phaseRef.value !== 'source_analysis' && phaseRef.value !== 'reflecting' && phaseRef.value !== 'synthesizing') {
      phaseRef.value = 'source_analysis';
      deps.eventBus.emit({ type: 'investigation_phase', phase: 'source_analysis' });
    }
    if (name === 'finish_investigation' || isAskUserTool(name)) {
      sequential.push(toolCall);
    } else {
      parallel.push(toolCall);
    }
  }

  // Execute parallelizable tools concurrently
  if (parallel.length > 0) {
    const settled = await Promise.allSettled(
      parallel.map(async (toolCall) => {
        const toolName = toolCall.function.name;
        const args = parseArgs(toolCall.function.arguments);
        const argsKey = toArgsKey(args);

        // Skip tools that already failed with the same arguments
        const priorFail = triedActions.find(a => a.tool === toolName && a.argsKey === argsKey && !a.success);
        if (priorFail !== undefined) {
          const msg = `Tool ${toolName} already failed with these arguments at iteration ${String(priorFail.iteration)}. Use different parameters or a different approach.`;
          deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.AGENT, tool: toolName, success: false, durationMs: 0, result: msg });
          return { role: 'tool' as const, tool_call_id: toolCall.id, content: msg };
        }

        // Skip tools that failed too many consecutive times with similar action signature
        const sig = buildActionSig(toolName, args);
        const consecutiveFails = getConsecutiveSigFailures(triedActions, sig);
        if (consecutiveFails >= MAX_SAME_SIG_FAILURES) {
          const msg = `[SKIPPED] "${toolName}" failed ${String(consecutiveFails)} consecutive times with similar args. Try a fundamentally different approach or call finish_investigation.`;
          deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.AGENT, tool: toolName, success: false, durationMs: 0, result: msg });
          triedActions.push({ tool: toolName, argsKey, sig, success: false, iteration });
          return { role: 'tool' as const, tool_call_id: toolCall.id, content: msg };
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
          triedActions.push({ tool: toolName, argsKey, sig: buildActionSig(toolName, args), success: true, iteration });
          return { role: 'tool' as const, tool_call_id: toolCall.id, content: snippet };
        }

        const { resultStr, success, durationMs } = await executeTool(deps, toolName, args);
        deps.eventBus.emit({
          type: 'tool_result', agent: AGENT_NAME.AGENT, tool: toolName, success, durationMs,
          result: resultStr.length > 2000 ? resultStr.slice(0, 2000) + '\n…(truncated)' : resultStr,
        });
        triedActions.push({ tool: toolName, argsKey, sig: buildActionSig(toolName, args), success, iteration });
        return { role: 'tool' as const, tool_call_id: toolCall.id, content: summarizeToolResult(resultStr) };
      }),
    );

    for (const entry of settled) {
      if (entry.status === 'fulfilled') {
        messages.push(entry.value);
      } else {
        const idx = settled.indexOf(entry);
        const failedCall = parallel[idx];
        if (failedCall !== undefined) {
          messages.push({ role: 'tool', tool_call_id: failedCall.id, content: `Error: ${String(entry.reason)}` });
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
      ? await deps.sourceMapCall(toolName, args)
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

/**
 * Emergency finish — synthesize a partial report from collected evidence
 * when agent exhausts max iterations without calling finish_investigation.
 * A partial report is always better than null.
 */
const ERROR_PATTERN = /(?:TypeError|ReferenceError|SyntaxError|RangeError|Error|Uncaught)[\s:].{5,200}/gi;

const buildEmergencyResult = (
  triedActions: TriedAction[],
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): FinishResult => {
  const consoleErrors: string[] = [];
  const reasonings: string[] = [];

  // Scan all messages for error evidence and reasoning
  for (const msg of messages) {
    if (typeof msg.content !== 'string') continue;
    const content = msg.content;

    // Extract console errors from tool results
    const errors = content.match(ERROR_PATTERN);
    if (errors !== null) {
      for (const err of errors) {
        if (!consoleErrors.includes(err)) consoleErrors.push(err);
      }
    }

    // Collect reasoning for summary
    if (msg.role === 'assistant' && content.length > 20) {
      reasonings.push(content.slice(0, 200));
    }
  }

  const toolsSummary = [...new Set(triedActions.map(a => a.tool))].join(', ');
  const hasEvidence = consoleErrors.length > 0;

  return {
    summary: hasEvidence
      ? `Investigation exhausted budget. Found ${String(consoleErrors.length)} error(s) but agent did not produce a structured report. Errors: ${consoleErrors[0] ?? 'unknown'}`
      : 'Investigation exhausted budget without finding clear errors. Partial investigation completed.',
    rootCause: hasEvidence
      ? consoleErrors[0] ?? 'Error found but could not determine exact root cause'
      : 'Could not determine root cause within budget',
    severity: hasEvidence ? 'medium' : 'low',
    stepsToReproduce: [],
    evidence: {
      consoleErrors,
      networkErrors: [],
    },
    suggestedFix: hasEvidence
      ? `Review the error(s) found: ${consoleErrors.slice(0, 3).join('; ')}`
      : undefined,
    networkFindings: [`Tools used: ${toolsSummary}`, `Total actions: ${String(triedActions.length)}`],
  };
};
