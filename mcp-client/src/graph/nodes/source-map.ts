/**
 * Source map resolution node — resolve, read, trace.
 */

import {
  INVESTIGATION_STATUS,
  AGENT_NAME,
  type CodeAnalysis,
  type SourceMapResolution,
} from '@ai-debug/shared';
import type { AgentState } from '../state.js';
import type { EventBus } from '../../observability/event-bus.js';
import { FetchSourceMapResponseSchema, ResolveErrorLocationResponseSchema } from '../../schemas/responses.js';

type SourceMapDeps = {
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
};

const resolveFirstError = async (
  bundleUrls: string[],
  deps: SourceMapDeps,
): Promise<{ resolution: SourceMapResolution; codeSnippet: string } | null> => {
  for (const bundleUrl of bundleUrls) {
    const fetchResult = FetchSourceMapResponseSchema.parse(await deps.mcpCall('fetch_source_map', { bundleUrl }));
    if (!fetchResult.success) continue;

    const resolveResult = ResolveErrorLocationResponseSchema.parse(
      await deps.mcpCall('resolve_error_location', { bundleUrl, line: 1, column: 0 }),
    );

    if (resolveResult.originalFile === undefined) continue;

    deps.eventBus.emit({
      type: 'sourcemap_resolved',
      bundleUrl,
      originalFile: resolveResult.originalFile,
      line: resolveResult.originalLine ?? 0,
    });

    return {
      resolution: {
        bundleUrl,
        sourceMapUrl: bundleUrl + '.map',
        originalFile: resolveResult.originalFile,
        originalLine: resolveResult.originalLine ?? 0,
        originalColumn: resolveResult.originalColumn ?? 0,
        codeSnippet: resolveResult.surroundingCode ?? '',
      },
      codeSnippet: resolveResult.surroundingCode ?? '',
    };
  }
  return null;
};

export const createSourceMapNode = (deps: SourceMapDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> => {
    const bundleUrls = state.initialObservations?.bundleUrls ?? [];
    if (bundleUrls.length === 0) return { status: INVESTIGATION_STATUS.INVESTIGATING };

    const result = await resolveFirstError(bundleUrls, deps);
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
