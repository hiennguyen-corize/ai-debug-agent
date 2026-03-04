/**
 * MCP Server types — barrel re-export.
 */

export type { BrowserConfig } from './browser.js';
export type { DomElement, DomSnapshot, SelectorCandidate } from './dom.js';
export type { ActionResult } from './actions.js';
export type { GuardrailConfig, GuardrailResult } from './guardrails.js';
export type { NetworkPayload } from './network.js';
export type {
  SourceMapOrigin,
  SourceMapResult,
  ResolvedLocation,
  ParsedErrorLocation,
  ImportChainLink,
  SourceMapConfig,
} from './sourcemap.js';

export type {
  BrowserTask,
  BrowserTaskResult,
  CapturedRequest,
  CapturedLog,
  ConsoleLogType,
  CorrelatedEvidence,
} from '@ai-debug/shared/types.js';
