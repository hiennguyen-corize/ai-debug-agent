/**
 * Config loader — 3-layer: file → env → request override → defaults.
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { InvestigationRequest } from '@ai-debug/shared';

const CONFIG_FILE_NAME = 'ai-debug.config.json';

const LLMConfigSchema = z.object({
  provider: z.string(),
  baseURL: z.string(),
  model: z.string(),
  apiKey: z.string(),
  supportsVision: z.boolean().default(false),
});

export type LLMRoleConfig = z.infer<typeof LLMConfigSchema>;

const AppConfigSchema = z.object({
  baseUrl: z.string().default('http://localhost:3000'),
  llm: z.object({
    default: LLMConfigSchema.default({
      provider: 'ollama', baseURL: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b', apiKey: '',
    }),
  }).default({}),
  agent: z.object({
    maxIterations: z.number().default(50),
    taskTimeoutMs: z.number().default(90_000),
    maxRetries: z.number().default(3),
    mode: z.enum(['interactive', 'autonomous']).default('interactive'),
  }).default({}),
  browser: z.object({
    headless: z.boolean().default(true),
    slowMo: z.number().default(0),
    timeout: z.number().default(30_000),
    viewport: z.object({ width: z.number(), height: z.number() }).default({ width: 1280, height: 720 }),
  }).default({}),
  sourcemap: z.object({
    enabled: z.boolean().default(true),
    localPath: z.string().nullable().default(null),
    buildDir: z.string().default('./dist'),
  }).default({}),
  output: z.object({
    reportsDir: z.string().default('./debug-reports'),
    streamLevel: z.enum(['summary', 'verbose']).default('summary'),
  }).default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

const resolveEnvVars = (value: string): string =>
  value.startsWith('$') ? (process.env[value.slice(1)] ?? '') : value;

const resolveConfigApiKeys = (obj: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      obj[key] = resolveEnvVars(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      resolveConfigApiKeys(value as Record<string, unknown>);
    }
  }
};

const loadFromFile = async (): Promise<unknown> => {
  try {
    const raw = await readFile(CONFIG_FILE_NAME, 'utf-8');
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
};

const deepMerge = (base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> => {
  const result = { ...base };
  for (const [key, val] of Object.entries(override)) {
    if (val === undefined || val === null) continue;
    const baseVal = result[key];
    if (typeof val === 'object' && !Array.isArray(val) && typeof baseVal === 'object' && baseVal !== null) {
      result[key] = deepMerge(baseVal as Record<string, unknown>, val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result;
};

export const loadConfig = async (requestOverrides?: InvestigationRequest['config']): Promise<AppConfig> => {
  const fileConfig = await loadFromFile();
  const merged = typeof fileConfig === 'object' && fileConfig !== null
    ? deepMerge(fileConfig as Record<string, unknown>, (requestOverrides ?? {}) as Record<string, unknown>)
    : (requestOverrides ?? {});
  const config = AppConfigSchema.parse(merged);
  resolveConfigApiKeys(config as unknown as Record<string, unknown>);
  return config;
};
