/**
 * Tool dispatch — routing tool calls to Playwright, source maps, or fetch-js-snippet.
 * Includes parallel execution with prior-fail guards.
 */

import { ToolMessage } from '@langchain/core/messages';
import { AGENT_NAME, ARTIFACT_TYPE } from '@ai-debug/shared';
import type { InvestigationPhase, ArtifactType } from '@ai-debug/shared';
import { summarizeToolResult } from '#agent/loop/snapshot-summarizer.js';
import { isSourceMapTool, isFetchJsSnippetTool } from '#agent/loop/tools.js';
import type { TriedAction, InvestigationConfigurable, ToolResult, ToolCallInfo, ParallelResult, FetchJsSnippetFn } from '#graph/state.js';
import { RECOVERABLE_PATTERNS, MAX_SAME_SIG_FAILURES, RETRY_DELAY_MS, EVENT_RESULT_PREVIEW_LEN } from '#graph/constants.js';
import { stringifyResult, extractArgsKey, extractSig, getConsecutiveSigFailures } from '#graph/helpers.js';
import { truncateToolResult } from '#graph/result-truncation.js';

const TOOL_ARTIFACT_MAP: Record<string, ArtifactType> = {
  browser_snapshot: ARTIFACT_TYPE.SNAPSHOT,
  browser_console_messages: ARTIFACT_TYPE.CONSOLE,
  browser_network_requests: ARTIFACT_TYPE.NETWORK,
};

// ── Single-tool execution ────────────────────────────────────────────────

const executePlaywrightTool = async (
  playwrightCall: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  toolName: string,
  args: Record<string, unknown>,
  retryCount = 0,
): Promise<ToolResult> => {
  const startMs = Date.now();
  try {
    const result = await playwrightCall(toolName, args);
    return { resultStr: stringifyResult(result), success: true, durationMs: Date.now() - startMs };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (retryCount < 1) {
      const recovery = RECOVERABLE_PATTERNS.find((r) => r.pattern.test(errorMsg));
      if (recovery !== undefined) {
        if (recovery.strategy === 'navigate_back') {
          try { await playwrightCall('browser_navigate', { url: 'about:blank' }); } catch { /* best effort */ }
        }
        await new Promise<void>((r) => { setTimeout(r, RETRY_DELAY_MS); });
        return executePlaywrightTool(playwrightCall, toolName, args, retryCount + 1);
      }
    }
    return { resultStr: `Error: ${errorMsg}`, success: false, durationMs: Date.now() - startMs };
  }
};

/** Dispatch a single tool call to the correct handler. */
export const dispatchTool = async (
  tc: ToolCallInfo,
  deps: InvestigationConfigurable,
  fetchJsSnippet: FetchJsSnippetFn,
): Promise<ToolResult> => {
  const { playwrightCall, sourceMapCall } = deps;

  if (isFetchJsSnippetTool(tc.name)) {
    const startMs = Date.now();
    try {
      const snippet = await fetchJsSnippet(tc.args as { url: string; line: number; context?: number | undefined });
      return { resultStr: snippet, success: true, durationMs: Date.now() - startMs };
    } catch (err) {
      return { resultStr: `Error: ${err instanceof Error ? err.message : String(err)}`, success: false, durationMs: Date.now() - startMs };
    }
  }

  if (isSourceMapTool(tc.name)) {
    const startMs = Date.now();
    try {
      const smResult = await sourceMapCall(tc.name, tc.args);
      return { resultStr: stringifyResult(smResult), success: true, durationMs: Date.now() - startMs };
    } catch (err) {
      return { resultStr: `Error: ${err instanceof Error ? err.message : String(err)}`, success: false, durationMs: Date.now() - startMs };
    }
  }

  return executePlaywrightTool(playwrightCall, tc.name, tc.args);
};

// ── Parallel execution ───────────────────────────────────────────────────

/** Execute tool calls in parallel with prior-fail guards. */
export const executeParallelTools = async (
  toolCalls: { name: string; id?: string; args: Record<string, unknown> }[],
  triedActions: TriedAction[],
  iteration: number,
  deps: InvestigationConfigurable,
  fetchJsSnippet: FetchJsSnippetFn,
  currentPhase: string,
): Promise<ParallelResult[]> => {
  const settled = await Promise.allSettled(
    toolCalls.map(async (tc): Promise<ParallelResult> => {
      const args = tc.args;
      const argsKey = extractArgsKey(args);
      const sig = extractSig(tc.name, args);

      // Guard: exact prior failure
      if (triedActions.some((a) => a.tool === tc.name && a.argsKey === argsKey && !a.success)) {
        deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: `Skipping ${tc.name} — already failed with same args` });
        return {
          msg: new ToolMessage({ content: '[SKIPPED — already failed with same args]', tool_call_id: tc.id ?? '' }),
          tried: { tool: tc.name, argsKey, sig, success: false, iteration },
          phase: '',
        };
      }

      // Guard: consecutive sig failures
      if (getConsecutiveSigFailures(triedActions, sig) >= MAX_SAME_SIG_FAILURES) {
        deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.AGENT, message: `Skipping ${tc.name} — too many failures on ${sig}` });
        return {
          msg: new ToolMessage({ content: `[SKIPPED — too many failures on ${sig}]`, tool_call_id: tc.id ?? '' }),
          tried: { tool: tc.name, argsKey, sig, success: false, iteration },
          phase: '',
        };
      }

      // Phase transition
      let phase = '';
      if (tc.name === 'browser_navigate' && currentPhase === 'scouting') {
        phase = 'investigating';
        deps.eventBus.emit({ type: 'investigation_phase', phase: 'investigating' as InvestigationPhase });
      }

      deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.AGENT, tool: tc.name, args });

      const toolResult = await dispatchTool({ name: tc.name, id: tc.id, args }, deps, fetchJsSnippet);

      deps.eventBus.emit({
        type: 'tool_result',
        agent: AGENT_NAME.AGENT,
        tool: tc.name,
        success: toolResult.success,
        durationMs: toolResult.durationMs,
        result: toolResult.resultStr.slice(0, EVENT_RESULT_PREVIEW_LEN),
      });

      // Emit artifact for evidence-producing tools
      const artifactType = TOOL_ARTIFACT_MAP[tc.name];
      if (artifactType !== undefined && toolResult.success) {
        deps.eventBus.emit({
          type: 'artifact_captured',
          artifactType,
          name: tc.name,
          content: toolResult.resultStr,
          ...(tc.id !== undefined ? { toolCallId: tc.id } : {}),
        });
      }

      return {
        msg: new ToolMessage({ content: truncateToolResult(summarizeToolResult(toolResult.resultStr), tc.name), tool_call_id: tc.id ?? '' }),
        tried: { tool: tc.name, argsKey, sig, success: toolResult.success, iteration },
        phase,
      };
    }),
  );

  return settled.filter((s) => s.status === 'fulfilled').map((s) => (s).value);
};
