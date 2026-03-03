/**
 * LLM client — OpenAI SDK wrapper supporting multi-provider.
 */

import OpenAI from 'openai';
import type { AgentName } from '@ai-debug/shared';
import type { AppConfig, LLMRoleConfig } from './config-loader.js';

const AGENT_ROLE_MAP = {
  scout: 'scout',
  investigator: 'investigator',
  explorer: 'explorer',
  synthesis: 'investigator',
} as const;

const resolveRoleConfig = (role: AgentName, config: AppConfig): LLMRoleConfig => {
  const roleKey = AGENT_ROLE_MAP[role];
  const llmConfig = config.llm;
  const roleSpecific = llmConfig[roleKey as keyof typeof llmConfig];
  if (roleSpecific !== undefined && typeof roleSpecific === 'object' && 'model' in roleSpecific) {
    return roleSpecific as LLMRoleConfig;
  }
  return llmConfig.default;
};

export type LLMClient = {
  client: OpenAI;
  model: string;
  provider: string;
};

export const createLLMClient = (role: AgentName, config: AppConfig): LLMClient => {
  const roleConfig = resolveRoleConfig(role, config);
  const client = new OpenAI({
    apiKey: roleConfig.apiKey || 'not-needed',
    baseURL: roleConfig.baseURL,
  });
  return { client, model: roleConfig.model, provider: roleConfig.provider };
};
