/**
 * Zod response schemas for MCP tool call results.
 */

import { z } from 'zod';

export const NavigateResponseSchema = z.object({
  sessionId: z.string().optional(),
});

export const ConsoleLogsResponseSchema = z.object({
  logs: z.array(z.object({
    type: z.string(),
    text: z.string(),
  })).default([]),
});

export const NetworkLogsResponseSchema = z.object({
  logs: z.array(z.object({
    method: z.string(),
    url: z.string(),
    status: z.number(),
  })).default([]),
});

export const DomResponseSchema = z.object({
  title: z.string().default(''),
  elements: z.array(z.unknown()).default([]),
});

export const FetchSourceMapResponseSchema = z.object({
  success: z.boolean().default(false),
});

export const ResolveErrorLocationResponseSchema = z.object({
  originalFile: z.string().optional(),
  originalLine: z.number().optional(),
  originalColumn: z.number().optional(),
  surroundingCode: z.string().optional(),
});

export const DispatchTaskResponseSchema = z.object({
  observations: z.array(z.string()).default([]),
  error: z.string().optional(),
});

export const ConfigFileSchema = z.record(z.string(), z.unknown());

export const RegistrySchema = z.object({
  reports: z.array(z.object({
    id: z.string(),
    url: z.string(),
    severity: z.string(),
    rootCause: z.string(),
    filePath: z.string(),
    timestamp: z.string(),
  })).default([]),
});
