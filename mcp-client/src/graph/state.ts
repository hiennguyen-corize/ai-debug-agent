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
  BrowserTask,
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

  pendingBrowserTask: Annotation<BrowserTask | null>,
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

  iterationCount: Annotation<number>({
    reducer: (prev, next) => next,
    default: () => 0,
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
