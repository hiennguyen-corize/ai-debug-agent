/**
 * Investigation graph assembly — LangGraph wiring.
 */

import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation } from './state.js';
import {
  routeFromPreflight,
  routeFromPlanner,
  routeFromExecutor,
  routeFromSourceMap,
  routeFromAskUser,
} from './routing.js';
import { preflightNode } from './nodes/preflight.js';
import { createScoutNode } from './nodes/scout.js';
import { createPlannerNode } from './nodes/planner.js';
import { createExecutorNode } from './nodes/executor.js';
import { createSourceMapNode } from './nodes/source-map.js';
import { createAskUserNode } from './nodes/ask-user.js';
import { createSynthesisNode } from './nodes/synthesis.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import type { SkillRegistry } from '#agent/skill-registry.js';
import type OpenAI from 'openai';

type McpCall = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

type GraphDeps = {
  plannerLLM: LLMClient;
  executorLLM: LLMClient;
  scoutLLM: LLMClient;
  synthesisLLM: LLMClient;
  eventBus: EventBus;
  mcpCall: McpCall;
  playwrightCall: McpCall;
  playwrightTools: OpenAI.Chat.ChatCompletionTool[];
  promptUser: (question: string) => Promise<string>;
  skillRegistry?: SkillRegistry | undefined;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export const createInvestigationGraph = (deps: GraphDeps) => {
  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('preflight', preflightNode)
    .addNode('scout', createScoutNode({ llmClient: deps.scoutLLM, eventBus: deps.eventBus, playwrightCall: deps.playwrightCall, skillRegistry: deps.skillRegistry }))
    .addNode('planner', createPlannerNode({ llmClient: deps.plannerLLM, eventBus: deps.eventBus, mcpCall: deps.mcpCall, skillRegistry: deps.skillRegistry }))
    .addNode('executor', createExecutorNode({ llmClient: deps.executorLLM, eventBus: deps.eventBus, playwrightCall: deps.playwrightCall, playwrightTools: deps.playwrightTools }))
    .addNode('source_map', createSourceMapNode({ eventBus: deps.eventBus, mcpCall: deps.mcpCall }))
    .addNode('ask_user', createAskUserNode({ promptUser: deps.promptUser }))
    .addNode('synthesis', createSynthesisNode({ llmClient: deps.synthesisLLM, eventBus: deps.eventBus, startTime: Date.now(), supportsVision: deps.synthesisLLM.supportsVision }))
    .addNode('force_synthesis', createSynthesisNode({ llmClient: deps.synthesisLLM, eventBus: deps.eventBus, startTime: Date.now(), supportsVision: deps.synthesisLLM.supportsVision }))

    .addEdge('__start__', 'preflight')
    .addConditionalEdges('preflight', routeFromPreflight)
    .addEdge('scout', 'planner')
    .addConditionalEdges('planner', routeFromPlanner)
    .addConditionalEdges('executor', routeFromExecutor)
    .addConditionalEdges('source_map', routeFromSourceMap)
    .addConditionalEdges('ask_user', routeFromAskUser)
    .addEdge('synthesis', END)
    .addEdge('force_synthesis', END);

  return graph.compile();
};
