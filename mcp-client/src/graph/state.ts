/**
 * LangGraph state annotation — investigation graph state channels.
 */

import { Annotation } from '@langchain/langgraph';
import type {
  InvestigationStatus,
  InvestigationMode,
  Hypothesis,
  Evidence,
  ScoutObservation,
  UserClarification,
  CodeAnalysis,
  InvestigationReport,
  BrowserTaskResult,
} from '@ai-debug/shared';

export const AgentStateAnnotation = Annotation.Root({
  url: Annotation<string>,
  hint: Annotation<string | null>,
  investigationMode: Annotation<InvestigationMode>,

  status: Annotation<InvestigationStatus>,

  initialObservations: Annotation<ScoutObservation | null>,
  currentSessionId: Annotation<string | null>,

  hypotheses: Annotation<Hypothesis[]>({
    reducer: (prev, next) => next,
    default: () => [],
  }),
  evidence: Annotation<Evidence[]>({
    reducer: (prev, next) => next,
    default: () => [],
  }),
  codeAnalysis: Annotation<CodeAnalysis | null>,

  // Planner → Executor communication
  investigationBrief: Annotation<string | null>,
  plannerRound: Annotation<number>({
    reducer: (prev, next) => next,
    default: () => 0,
  }),
  executorResults: Annotation<string[]>({
    reducer: (prev, next) => next,
    default: () => [],
  }),

  // Legacy — kept for compatibility with BrowserTaskResult type
  browserTaskResults: Annotation<BrowserTaskResult[]>({
    reducer: (prev, next) => next,
    default: () => [],
  }),

  pendingQuestion: Annotation<string | null>,
  userClarifications: Annotation<UserClarification[]>({
    reducer: (prev, next) => next,
    default: () => [],
  }),
  assumptions: Annotation<string[]>({
    reducer: (prev, next) => next,
    default: () => [],
  }),

  maxIterations: Annotation<number>({
    reducer: (prev, next) => next,
    default: () => 30,
  }),

  detectedFrameworks: Annotation<string[]>({
    reducer: (prev, next) => next,
    default: () => [],
  }),
  activeSkills: Annotation<string[]>({
    reducer: (prev, next) => next,
    default: () => [],
  }),

  finalReport: Annotation<InvestigationReport | null>,
});

export type AgentState = typeof AgentStateAnnotation.State;
