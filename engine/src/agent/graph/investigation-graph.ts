/**
 * LangGraph investigation graph — StateGraph definition + compile.
 *
 * Topology: START → agent → shouldContinue?
 *   ├── tools → after_tools → shouldContinueAfterTools?
 *   │                           ├── agent (loop)
 *   │                           ├── force_finish → agent (retry with finish prompt)
 *   │                           └── end → END
 *   ├── no_tools → agent (retry)
 *   ├── emergency → END
 *   └── end → END
 */

import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { InvestigationState } from '#graph/state.js';
import type { InvestigationStateType, FetchJsSnippetFn, LangChainTool } from '#graph/state.js';
import { NO_TOOL_RETRY_MESSAGE } from '#graph/constants.js';
import {
  createAgentNode,
  createToolNode,
  afterToolsNode,
  forceFinishNode,
  emergencyNode,
  shouldContinue,
  shouldContinueAfterTools,
} from '#graph/nodes.js';
import type { ChatOpenAI } from '@langchain/openai';

export type GraphDeps = {
  model: ChatOpenAI;
  tools: LangChainTool[];
  fetchJsSnippet: FetchJsSnippetFn;
};

export const createInvestigationGraph = (deps: GraphDeps) => {
  const agentNode = createAgentNode(deps.model, deps.tools);
  const toolNode = createToolNode(deps.fetchJsSnippet);

  const noToolsNode = (state: InvestigationStateType): Partial<InvestigationStateType> => ({
    messages: [...state.messages, new HumanMessage({ content: NO_TOOL_RETRY_MESSAGE })],
    noToolCount: state.noToolCount + 1,
  });

  return new StateGraph(InvestigationState)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addNode('after_tools', afterToolsNode)
    .addNode('no_tools', noToolsNode)
    .addNode('force_finish', forceFinishNode)
    .addNode('emergency', emergencyNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      no_tools: 'no_tools',
      emergency: 'emergency',
      end: END,
    })
    .addEdge('no_tools', 'agent')
    .addEdge('tools', 'after_tools')
    .addConditionalEdges('after_tools', shouldContinueAfterTools, {
      agent: 'agent',
      force_finish: 'force_finish',
      end: END,
    })
    .addEdge('force_finish', 'agent')
    .addEdge('emergency', END)
    .compile({ checkpointer: new MemorySaver() });
};

