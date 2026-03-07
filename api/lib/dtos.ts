/**
 * Response DTOs — shape data returned by the API.
 */

import type { InvestigationReport, InvestigationMode, ThreadStatus } from '@ai-debug/shared';

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
