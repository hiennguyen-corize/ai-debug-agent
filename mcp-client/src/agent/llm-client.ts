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

type RoleKey = keyof typeof AGENT_ROLE_MAP;
type LLMConfigKey = 'investigator' | 'explorer' | 'scout';

const resolveRoleConfig = (role: AgentName, config: AppConfig): LLMRoleConfig => {
  const roleKey = AGENT_ROLE_MAP[role as RoleKey] as LLMConfigKey;
  const roleSpecific = config.llm[roleKey];
  return roleSpecific ?? config.llm.default;
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
