/**
 * Source map resolution node — resolve, read, trace.
 *
 * Uses parsed stack trace frames to resolve actual error locations
 * instead of hardcoding line:1 col:0.
 */

import {
  INVESTIGATION_STATUS,
  TOOL_NAME,
  type CodeAnalysis,
  type ParsedError,
  type SourceMapResolution,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import { FetchSourceMapResponseSchema, ResolveErrorLocationResponseSchema } from '#schemas/responses.js';

type SourceMapDeps = {
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
};

const buildResolution = (
  bundleUrl: string,
  resolveResult: { originalFile?: string | undefined; originalLine?: number | undefined; originalColumn?: number | undefined; surroundingCode?: string | undefined },
): { resolution: SourceMapResolution; codeSnippet: string } => ({
  resolution: {
    bundleUrl,
    sourceMapUrl: bundleUrl + '.map',
    originalFile: resolveResult.originalFile ?? '',
    originalLine: resolveResult.originalLine ?? 0,
    originalColumn: resolveResult.originalColumn ?? 0,
    codeSnippet: resolveResult.surroundingCode ?? '',
  },
  codeSnippet: resolveResult.surroundingCode ?? '',
});

/**
 * Attempt to resolve a single bundle URL + line/col via source map.
 */
const tryResolve = async (
  bundleUrl: string,
  line: number,
  column: number,
  deps: SourceMapDeps,
): Promise<{ resolution: SourceMapResolution; codeSnippet: string } | null> => {
  const fetchResult = FetchSourceMapResponseSchema.parse(
    await deps.mcpCall(TOOL_NAME.FETCH_SOURCE_MAP, { bundleUrl }),
  );
  if (!fetchResult.success) return null;

  const resolveResult = ResolveErrorLocationResponseSchema.parse(
    await deps.mcpCall(TOOL_NAME.RESOLVE_ERROR_LOCATION, { bundleUrl, line, column }),
  );
  if (resolveResult.originalFile === undefined) return null;

  deps.eventBus.emit({
    type: 'sourcemap_resolved',
    bundleUrl,
    originalFile: resolveResult.originalFile,
    line: resolveResult.originalLine ?? 0,
  });

  return buildResolution(bundleUrl, resolveResult);
};

/**
 * Resolve from parsed stack trace frames — uses real line:col.
 */
const resolveFromParsedErrors = async (
  parsedErrors: ParsedError[],
  deps: SourceMapDeps,
): Promise<{ resolution: SourceMapResolution; codeSnippet: string } | null> => {
  for (const error of parsedErrors) {
    for (const frame of error.frames) {
      const result = await tryResolve(frame.file, frame.line, frame.column, deps);
      if (result !== null) return result;
    }
  }
  return null;
};

/**
 * Fallback: resolve with line:1 col:0 for each bundle URL (legacy behavior).
 */
const resolveFromBundleUrls = async (
  bundleUrls: string[],
  deps: SourceMapDeps,
): Promise<{ resolution: SourceMapResolution; codeSnippet: string } | null> => {
  for (const bundleUrl of bundleUrls) {
    const result = await tryResolve(bundleUrl, 1, 0, deps);
    if (result !== null) return result;
  }
  return null;
};

export const createSourceMapNode = (deps: SourceMapDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> => {
    const parsedErrors = state.initialObservations?.parsedErrors ?? [];
    const bundleUrls = state.initialObservations?.bundleUrls ?? [];

    if (parsedErrors.length === 0 && bundleUrls.length === 0) {
      return { status: INVESTIGATION_STATUS.INVESTIGATING };
    }

    // Prefer parsed stack frames (real line:col), fallback to legacy bundleUrl scan
    const result =
      (parsedErrors.length > 0 ? await resolveFromParsedErrors(parsedErrors, deps) : null)
      ?? await resolveFromBundleUrls(bundleUrls, deps);

    if (result === null) {
      deps.eventBus.emit({ type: 'sourcemap_failed', bundleUrl: bundleUrls[0] ?? '', reason: 'No source maps found' });
      return { status: INVESTIGATION_STATUS.INVESTIGATING };
    }

    const analysis: CodeAnalysis = {
      errorLocation: result.resolution,
      dataFlow: { uiComponent: '', apiCall: '', stateUpdate: '', rootCause: '' },
      suggestedFix: null,
    };

    return { codeAnalysis: analysis, status: INVESTIGATION_STATUS.INVESTIGATING };
  };
