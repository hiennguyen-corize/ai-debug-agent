/**
 * Tool node — dispatches tool calls (parallel + sequential).
 */

import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AGENT_NAME } from '@ai-debug/shared';
import type { InvestigationPhase } from '@ai-debug/shared';
import { normalizeFinishResult } from '#agent/definitions/normalize.js';
import { isAskUserTool } from '#agent/definitions/tools.js';
import type { FinishResult } from '#agent/definitions/types.js';
import type { InvestigationStateType, TriedAction, FetchJsSnippetFn } from '#graph/state.js';
import { getConfigurable } from '#graph/helpers.js';
import { executeParallelTools } from '#graph/tool-dispatch.js';
import { interrupt } from '@langchain/langgraph';

type ToolCall = { id?: string; name: string; args: Record<string, unknown> };
type SequentialResult = { messages: BaseMessage[]; result: FinishResult | null };
type EventBus = ReturnType<typeof getConfigurable>['eventBus'];

const handleSequentialToolCalls = (calls: ToolCall[], eventBus: EventBus): SequentialResult => {
  const messages: BaseMessage[] = [];
  let result: FinishResult | null = null;

  for (const tc of calls) {
    const args = tc.args;

    if (tc.name === 'finish_investigation') {
      eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' as InvestigationPhase });
      result = normalizeFinishResult(args);
      messages.push(new ToolMessage({ content: 'Report submitted successfully.', tool_call_id: tc.id ?? '' }));
    } else if (isAskUserTool(tc.name)) {
      const question = (args['question'] as string | undefined) ?? 'Need your input';
      const ctx = (args['context'] as string | undefined) ?? '';
      eventBus.emit({ type: 'waiting_for_input', agent: AGENT_NAME.AGENT, prompt: `${question}\n\nContext: ${ctx}` });
      const userResponse = String(interrupt({ question, context: ctx }));
      messages.push(new ToolMessage({ content: `User response: ${userResponse}`, tool_call_id: tc.id ?? '' }));
    }
  }

  return { messages, result };
};

export const createToolNode = (fetchJsSnippet: FetchJsSnippetFn) => {
  return async (state: InvestigationStateType, config: RunnableConfig): Promise<Partial<InvestigationStateType>> => {
    const { messages, triedActions, iteration } = state;
    const deps = getConfigurable(config);

    const lastMsg = messages[messages.length - 1];
    if (!(lastMsg instanceof AIMessage)) return {};

    const toolCalls = lastMsg.tool_calls ?? [];
    if (toolCalls.length === 0) return {};

    const parallel = toolCalls.filter((tc) => tc.name !== 'finish_investigation' && !isAskUserTool(tc.name));
    const sequential = toolCalls.filter((tc) => tc.name === 'finish_investigation' || isAskUserTool(tc.name));

    const newMessages: BaseMessage[] = [];
    const newTriedActions: TriedAction[] = [];
    let newPhase = state.phase;

    const parallelResults = await executeParallelTools(parallel, triedActions, iteration, deps, fetchJsSnippet, newPhase);
    for (const r of parallelResults) {
      newMessages.push(r.msg);
      newTriedActions.push(r.tried);
      if (r.phase !== '') newPhase = r.phase;
    }

    const seq = handleSequentialToolCalls(sequential, deps.eventBus);
    newMessages.push(...seq.messages);

    return { messages: [...messages, ...newMessages], triedActions: newTriedActions, result: seq.result, phase: newPhase, noToolCount: 0 };
  };
};
