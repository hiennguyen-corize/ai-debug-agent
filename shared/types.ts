import { z } from 'zod';

// ─── Investigation Request ──────────────────────────────────────────

export const InvestigationRequestSchema = z.object({
  url: z.string().url(),
  hint: z.string().optional(),
  mode: z.enum(['interactive', 'autonomous']).default('autonomous'),
  callbackUrl: z.string().url().optional(),
  sourcemapDir: z.string().optional(),

  config: z
    .object({
      llm: z
        .object({
          investigator: z
            .object({
              provider: z.string(),
              model: z.string(),
              baseURL: z.string().optional(),
              apiKey: z.string().optional(),
            })
            .partial()
            .optional(),
          explorer: z
            .object({
              provider: z.string(),
              model: z.string(),
              baseURL: z.string().optional(),
              apiKey: z.string().optional(),
            })
            .partial()
            .optional(),
        })
        .partial()
        .optional(),
      agent: z
        .object({
          maxIterations: z.number().optional(),
          maxRetries: z.number().optional(),
        })
        .partial()
        .optional(),
      output: z
        .object({
          streamLevel: z.enum(['summary', 'verbose']).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type InvestigationRequest = z.infer<typeof InvestigationRequestSchema>;

// ─── Browser Task ───────────────────────────────────────────────────

export interface BrowserTask {
  task: string;
  lookFor: string[];
  stopCondition: string;
  maxActions?: number;
}

export interface BrowserTaskResult {
  observations: string[];
  networkActivity: CapturedRequest[];
  consoleActivity: CapturedLog[];
  screenshotPaths: string[];
  error?: string;
}

// ─── Correlation Tracing ────────────────────────────────────────────

export interface CapturedRequest {
  actionId: string;
  method: string;
  url: string;
  status: number;
  requestStart: number;
  responseEnd: number;
  durationMs: number;
  initiator: string;
}

export interface CapturedLog {
  actionId: string;
  type: 'log' | 'warning' | 'error' | 'info';
  text: string;
  timestamp: number;
}

export interface CorrelatedEvidence {
  actionId: string;
  action: string;
  timestamp: number;
  networkEvents: CapturedRequest[];
  consoleEvents: CapturedLog[];
}

// ─── Hypothesis & Evidence ──────────────────────────────────────────

export type HypothesisStatus = 'untested' | 'testing' | 'confirmed' | 'refuted' | 'partial';

export interface Hypothesis {
  id: string;
  statement: string;
  confidence: number;
  status: HypothesisStatus;
  testStrategy: string;
}

export type EvidenceCategory = 'network' | 'console' | 'dom' | 'source' | 'user_input';

export type EvidenceType =
  | 'network_error'
  | 'network_success'
  | 'console_error'
  | 'console_log'
  | 'dom_anomaly'
  | 'source_code'
  | 'user_clarification';

export interface Evidence {
  id: string;
  hypothesisId: string;
  category: EvidenceCategory;
  type: EvidenceType;
  description: string;
  data: unknown;
  timestamp: number;
}

// ─── Finish Investigation ───────────────────────────────────────────

export const FinishInvestigationSchema = z.object({
  rootCause: z.string(),
  severity: z.enum(['critical', 'major', 'minor', 'cosmetic']),
  confidence: z.number().min(0).max(1),
  codeLocation: z
    .object({
      file: z.string(),
      line: z.number(),
      column: z.number().optional(),
      snippet: z.string().optional(),
      uiComponent: z.string().optional(),
    })
    .optional(),
  dataFlow: z.string().optional(),
  suggestedFix: z.string().optional(),
  reproSteps: z.array(z.string()),
  assumptions: z.array(z.string()).default([]),
});

export type FinishInvestigation = z.infer<typeof FinishInvestigationSchema>;

// ─── Agent Events ───────────────────────────────────────────────────

export type AgentName = 'scout' | 'investigator' | 'explorer' | 'synthesis';

export type AgentEvent =
  | { type: 'reasoning'; agent: AgentName; text: string }
  | { type: 'tool_call'; agent: AgentName; tool: string; args: unknown }
  | {
      type: 'tool_result';
      agent: AgentName;
      tool: string;
      success: boolean;
      durationMs: number;
    }
  | { type: 'llm_usage'; agent: AgentName; promptTokens: number; completionTokens: number }
  | { type: 'error'; agent: AgentName; message: string }
  | { type: 'hypothesis_created'; hypotheses: Hypothesis[] }
  | {
      type: 'hypothesis_updated';
      id: string;
      oldConfidence: number;
      newConfidence: number;
      status: string;
    }
  | { type: 'sourcemap_resolved'; bundleUrl: string; originalFile: string; line: number }
  | { type: 'sourcemap_failed'; bundleUrl: string; reason: string }
  | { type: 'user_question'; question: string; context: string }
  | { type: 'user_answered'; question: string }
  | {
      type: 'investigation_phase';
      phase: 'scouting' | 'hypothesizing' | 'investigating' | 'source_analysis' | 'synthesizing';
    };

// ─── Investigation Step (aggregated) ────────────────────────────────

export interface InvestigationStep {
  timestamp: string;
  agent: AgentName;
  type: 'thinking' | 'action' | 'result' | 'hypothesis' | 'phase_change' | 'error';
  summary: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

export type StreamLevel = 'summary' | 'verbose';

// ─── Investigation Status ───────────────────────────────────────────

export type InvestigationStatus =
  | 'idle'
  | 'scouting'
  | 'hypothesizing'
  | 'investigating'
  | 'waiting_explorer'
  | 'source_analysis'
  | 'synthesizing'
  | 'done'
  | 'error'
  | 'cannot_determine';

// ─── Model Profile ──────────────────────────────────────────────────

export type ModelTier = 'tier1' | 'tier2' | 'tier3';

export interface ModelProfile {
  tier: ModelTier;
  domElementLimit: number;
  tokenBudgetRatio: number;
  compressThreshold: number;
  spaWaitMs: number;
  spaFillWaitMs: number;
  sourceMapEnabled: boolean;
  maxHypotheses: number;
  taskTimeoutMs: number;
}
