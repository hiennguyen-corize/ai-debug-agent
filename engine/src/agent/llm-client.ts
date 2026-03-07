/**
 * LLM client — OpenAI SDK wrapper, single role.
 */

import OpenAI from 'openai';
import type { AppConfig } from './config-loader.js';

export type LLMClient = {
  client: OpenAI;
  model: string;
  provider: string;
  supportsVision: boolean;
};

export const createLLMClient = (config: AppConfig): LLMClient => {
  const llmConfig = config.llm.default;
  const client = new OpenAI({
    apiKey: llmConfig.apiKey || 'not-needed',
    baseURL: llmConfig.baseURL,
    timeout: 60_000,
  });
  return {
    client,
    model: llmConfig.model,
    provider: llmConfig.provider,
    supportsVision: llmConfig.supportsVision,
  };
};
