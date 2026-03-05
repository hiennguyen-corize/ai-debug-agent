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
  if (role in AGENT_ROLE_MAP) {
    const mappedRole = AGENT_ROLE_MAP[role as keyof typeof AGENT_ROLE_MAP];
    const roleSpecific = config.llm[mappedRole];
    if (roleSpecific !== undefined) return roleSpecific;
  }
  return config.llm.default;
};

export type LLMClient = {
  client: OpenAI;
  model: string;
  provider: string;
  supportsVision: boolean;
};

export const createLLMClient = (role: AgentName, config: AppConfig): LLMClient => {
  const roleConfig = resolveRoleConfig(role, config);
  const client = new OpenAI({
    apiKey: roleConfig.apiKey || 'not-needed',
    baseURL: roleConfig.baseURL,
  });
  return { client, model: roleConfig.model, provider: roleConfig.provider, supportsVision: roleConfig.supportsVision };
};
