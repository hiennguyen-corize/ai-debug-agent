/**
 * Response DTOs — shape data returned by the API.
 */

import type { InvestigationReport, InvestigationMode, ThreadStatus } from '@ai-debug/shared';
import type { ThreadRecord } from '#repositories/thread-repository.js';

export type ThreadListItem = {
  threadId: string;
  status: ThreadStatus;
  request: { url: string; hint: string; mode: InvestigationMode };
  report: InvestigationReport | null;
  error: string | null;
  createdAt: number;
};

export type ThreadDetail = Omit<ThreadListItem, 'createdAt'>;

export type CreateThreadResult = {
  threadId: string;
  status: 'queued' | 'started';
  position?: number;
};

export type ReportListItem = {
  threadId: string;
  url: string;
  report: string | null;
  status: ThreadStatus;
  createdAt: number;
};

export const toListItem = (t: ThreadRecord): ThreadListItem => ({
  threadId: t.id,
  status: t.status,
  request: { url: t.url, hint: t.hint, mode: t.mode },
  report: t.report,
  error: t.error,
  createdAt: t.createdAt.getTime(),
});

export const toDetail = (t: ThreadRecord): ThreadDetail => ({
  threadId: t.id,
  status: t.status,
  request: { url: t.url, hint: t.hint, mode: t.mode },
  report: t.report,
  error: t.error,
});
