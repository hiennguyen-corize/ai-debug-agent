/**
 * Evidence factory functions — shared across Scout and Explorer nodes.
 */

import {
  type BrowserTaskResult,
  type Evidence,
  EVIDENCE_TYPE,
  EVIDENCE_CATEGORY,
} from '@ai-debug/shared';

export const taskResultToEvidence = (result: BrowserTaskResult): Evidence[] =>
  result.observations.map((obs) => ({
    id: `explorer-${crypto.randomUUID().slice(0, 8)}`,
    hypothesisId: '',
    category: EVIDENCE_CATEGORY.DOM,
    type: EVIDENCE_TYPE.DOM_ANOMALY,
    description: obs,
    data: obs,
    timestamp: Date.now(),
  }));

export const consoleErrorsToEvidence = (consoleErrors: string[]): Evidence[] =>
  consoleErrors.map((err, i) => ({
    id: `scout-console-${i.toString()}`,
    hypothesisId: '',
    category: EVIDENCE_CATEGORY.CONSOLE,
    type: EVIDENCE_TYPE.CONSOLE_ERROR,
    description: err,
    data: err,
    timestamp: Date.now(),
  }));
