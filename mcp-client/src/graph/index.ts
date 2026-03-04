/**
 * Investigation graph assembly — LangGraph wiring.
 */

import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation, type AgentState } from './state.js';
import {
  routeFromPreflight,
  routeFromInvestigator,
  routeFromExplorer,
  routeFromSourceMap,
  routeFromAskUser,
} from './routing.js';
import { preflightNode } from './nodes/preflight.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';

type GraphDeps = {
  investigatorLLM: LLMClient;
  explorerLLM: LLMClient;
  scoutLLM: LLMClient;
  synthesisLLM: LLMClient;
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
  promptUser: (question: string) => Promise<string>;
};

export const createInvestigationGraph = async (deps: GraphDeps) => {
  const { createScoutNode } = await import('./nodes/scout.js');
  const { createInvestigatorNode } = await import('./nodes/investigator.js');
  const { createExplorerNode } = await import('./nodes/explorer.js');
  const { createSourceMapNode } = await import('./nodes/source-map.js');
  const { createAskUserNode } = await import('./nodes/ask-user.js');
  const { createSynthesisNode } = await import('./nodes/synthesis.js');

  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('preflight', preflightNode)
    .addNode('scout', createScoutNode({ llmClient: deps.scoutLLM, eventBus: deps.eventBus, mcpCall: deps.mcpCall }))
    .addNode('investigator', createInvestigatorNode({ llmClient: deps.investigatorLLM, eventBus: deps.eventBus, mcpCall: deps.mcpCall }))
    .addNode('explorer', createExplorerNode({ llmClient: deps.explorerLLM, eventBus: deps.eventBus, mcpCall: deps.mcpCall }))
    .addNode('source_map', createSourceMapNode({ eventBus: deps.eventBus, mcpCall: deps.mcpCall }))
    .addNode('ask_user', createAskUserNode({ promptUser: deps.promptUser }))
    .addNode('synthesis', createSynthesisNode({ llmClient: deps.synthesisLLM, eventBus: deps.eventBus, startTime: Date.now() }))
    .addNode('force_synthesis', createSynthesisNode({ llmClient: deps.synthesisLLM, eventBus: deps.eventBus, startTime: Date.now() }))
    .addEdge('__start__', 'preflight')
    .addConditionalEdges('preflight', routeFromPreflight, {
      scout: 'scout',
      ask_user: 'ask_user',
    })
    .addEdge('scout', 'investigator')
    .addConditionalEdges('investigator', routeFromInvestigator, {
      investigator: 'investigator',
      explorer: 'explorer',
      source_map: 'source_map',
      ask_user: 'ask_user',
      synthesis: 'synthesis',
      force_synthesis: 'force_synthesis',
    })
    .addConditionalEdges('explorer', routeFromExplorer, { investigator: 'investigator' })
    .addConditionalEdges('source_map', routeFromSourceMap, { investigator: 'investigator' })
    .addConditionalEdges('ask_user', routeFromAskUser, { investigator: 'investigator' })
    .addEdge('synthesis', END)
    .addEdge('force_synthesis', END);

  return graph.compile();
};
