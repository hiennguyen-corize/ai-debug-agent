/**
 * Config loader — 3-layer: file → env → request override → defaults.
 */

import { readFile } from 'node:fs/promises';
import type { InvestigationRequest } from '@ai-debug/shared';

const CONFIG_FILE_NAME = 'ai-debug.config.json';

const DEFAULT_CONFIG = {
  baseUrl: 'http://localhost:3000',
  llm: {
    default: {
      provider: 'ollama',
      baseURL: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
      apiKey: '',
    },
  },
  agent: {
    maxIterations: 30,
    taskTimeoutMs: 90_000,
    tokenBudgetRatio: 0.85,
    maxRetries: 3,
    retryBaseDelayMs: 1_000,
    mode: 'interactive' as const,
  },
  browser: {
    headless: true,
    slowMo: 0,
    timeout: 30_000,
    viewport: { width: 1280, height: 720 },
  },
  sourcemap: {
    enabled: true,
    localPath: null as string | null,
    buildDir: './dist',
  },
  guardrails: { allowList: [] as string[] },
  output: {
    reportsDir: './debug-reports',
    deduplicationThreshold: 0.85,
    streamLevel: 'summary' as const,
  },
} as const;

export type AppConfig = typeof DEFAULT_CONFIG & {
  llm: {
    default: LLMRoleConfig;
    investigator?: LLMRoleConfig;
    explorer?: LLMRoleConfig;
    scout?: LLMRoleConfig;
  };
};

export type LLMRoleConfig = {
  provider: string;
  baseURL: string;
  model: string;
  apiKey: string;
};

const resolveEnvVars = (value: string): string => {
  if (value.startsWith('$')) {
    const envKey = value.slice(1);
    return process.env[envKey] ?? '';
  }
  return value;
};

const resolveConfigApiKeys = (config: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      (config as Record<string, string>)[key] = resolveEnvVars(value);
    } else if (typeof value === 'object' && value !== null) {
      resolveConfigApiKeys(value as Record<string, unknown>);
    }
  }
};

const loadFromFile = async (): Promise<Record<string, unknown>> => {
  try {
    const raw = await readFile(CONFIG_FILE_NAME, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const deepMerge = (base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> => {
  const result = { ...base };
  for (const [key, val] of Object.entries(override)) {
    if (val !== undefined && val !== null) {
      const baseVal = result[key];
      if (typeof val === 'object' && !Array.isArray(val) && typeof baseVal === 'object' && baseVal !== null) {
        result[key] = deepMerge(baseVal as Record<string, unknown>, val as Record<string, unknown>);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
};

export const loadConfig = async (requestOverrides?: InvestigationRequest['config']): Promise<AppConfig> => {
  const fileConfig = await loadFromFile();
  const merged = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, fileConfig);
  if (requestOverrides !== undefined) {
    deepMerge(merged, requestOverrides as unknown as Record<string, unknown>);
  }
  resolveConfigApiKeys(merged);
  return merged as unknown as AppConfig;
};
