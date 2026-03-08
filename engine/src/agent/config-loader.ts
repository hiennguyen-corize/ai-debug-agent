/**
 * Config loader — 3-layer: file → env → request override → defaults.
 */

import dotenv from 'dotenv';
import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { InvestigationRequest } from '@ai-debug/shared';

const CONFIG_FILE_NAME = 'ai-debug.config.json';

/** Walk up from CWD to find the config file (handles monorepo sub-packages). */
const findConfigFile = async (): Promise<string> => {
  const startDir = process.cwd();
  for (let dir = startDir; ; dir = dirname(dir)) {
    const candidate = join(dir, CONFIG_FILE_NAME);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // not found here, go up
    }
    const parent = dirname(dir);
    if (parent === dir) break;
  }
  throw new Error(
    `${CONFIG_FILE_NAME} not found. Searched from ${startDir} upward. ` +
    'Create the config file with at least llm.default (provider, baseURL, model, apiKey).',
  );
};

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
    default: LLMConfigSchema,
  }),
  agent: z.object({
    maxIterations: z.number().default(50),
    contextWindow: z.number().default(128_000),
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

const resolveEnvVars = (value: string): string => {
  if (!value.startsWith('$')) return value;
  const envName = value.slice(1);
  const resolved = process.env[envName];
  if (resolved === undefined || resolved === '') {
    throw new Error(
      `Environment variable ${envName} is not set. ` +
      'Set it in your shell or create a .env file in the project root.',
    );
  }
  return resolved;
};

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
  const configPath = await findConfigFile();
  // Load .env from the same directory as the config file
  dotenv.config({ path: join(dirname(configPath), '.env') });
  const raw = await readFile(configPath, 'utf-8');
  return JSON.parse(raw) as unknown;
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
  resolveConfigApiKeys(merged as Record<string, unknown>);
  const config = AppConfigSchema.parse(merged);
  return config;
};
