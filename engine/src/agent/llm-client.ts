/**
 * LLM client — LangChain ChatOpenAI for LangGraph.
 */

import { ChatOpenAI } from '@langchain/openai';
import type { AppConfig } from './config-loader.js';

const LLM_TIMEOUT_MS = 60_000;
const LLM_TEMPERATURE = 0;
const LLM_MAX_RETRIES = 3;

/** ChatOpenAI for LangGraph — supports all OpenAI-compatible endpoints. */
export const createChatModel = (config: AppConfig): ChatOpenAI => {
  const llmConfig = config.llm.default;
  return new ChatOpenAI({
    model: llmConfig.model,
    configuration: {
      baseURL: llmConfig.baseURL,
      apiKey: llmConfig.apiKey,
    },
    temperature: LLM_TEMPERATURE,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: LLM_MAX_RETRIES,
    modelKwargs: { parallel_tool_calls: false },
  });
};

