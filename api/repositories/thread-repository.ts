/**
 * ThreadRepository — data access layer using Drizzle ORM.
 */

import { eq, desc, isNotNull, inArray } from 'drizzle-orm';
import { threads, events } from '#db/schema.js';
import type { AppDatabase } from '#db/client.js';
import type { InvestigationReport, InvestigationMode, AgentEvent, ThreadStatus } from '@ai-debug/shared';

const THREAD_LIST_LIMIT = 50;

export type ThreadRecord = {
  id: string;
  status: ThreadStatus;
  url: string;
  hint: string;
  mode: InvestigationMode;
  report: InvestigationReport | null;
  error: string | null;
  createdAt: Date;
};

type CreateThreadInput = {
  id: string;
  url: string;
  hint: string;
  mode: InvestigationMode;
};

const parseReport = (raw: string | null): InvestigationReport | null => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as InvestigationReport;
  } catch {
    return null;
  }
};

const toRecord = (row: typeof threads.$inferSelect): ThreadRecord => ({
  id: row.id,
  status: row.status,
  url: row.url,
  hint: row.hint ?? '',
  mode: row.mode,
  report: parseReport(row.report),
  error: row.error,
  createdAt: row.createdAt,
});

export const createThreadRepository = (db: AppDatabase): {
  create(input: CreateThreadInput): ThreadRecord;
  findById(threadId: string): ThreadRecord | undefined;
  findAll(): ThreadRecord[];
  findWithReports(): ThreadRecord[];
  updateStatus(threadId: string, status: ThreadRecord['status']): void;
  updateReport(threadId: string, report: InvestigationReport): void;
  updateError(threadId: string, error: string): void;
  insertEvent(threadId: string, event: AgentEvent): void;
  findEventsByThreadId(threadId: string): AgentEvent[];
  cleanupOrphaned(): number;
} => ({
  create(input: CreateThreadInput): ThreadRecord {
    db.insert(threads).values({
      id: input.id,
      url: input.url,
      hint: input.hint,
      mode: input.mode,
    }).run();

    const thread = this.findById(input.id);
    if (thread === undefined) throw new Error(`Thread ${input.id} not found after creation`);
    return thread;
  },

  findById(threadId: string): ThreadRecord | undefined {
    const row = db.select().from(threads).where(eq(threads.id, threadId)).get();
    return row !== undefined ? toRecord(row) : undefined;
  },

  findAll(): ThreadRecord[] {
    const rows = db.select().from(threads).orderBy(desc(threads.createdAt)).limit(THREAD_LIST_LIMIT).all();
    return rows.map(toRecord);
  },

  findWithReports(): ThreadRecord[] {
    const rows = db.select().from(threads).where(isNotNull(threads.report)).orderBy(desc(threads.createdAt)).all();
    return rows.map(toRecord);
  },

  updateStatus(threadId: string, status: ThreadRecord['status']): void {
    db.update(threads).set({ status }).where(eq(threads.id, threadId)).run();
  },

  updateReport(threadId: string, report: InvestigationReport): void {
    db.update(threads).set({ report: JSON.stringify(report), status: 'done' }).where(eq(threads.id, threadId)).run();
  },

  updateError(threadId: string, error: string): void {
    db.update(threads).set({ error, status: 'error' }).where(eq(threads.id, threadId)).run();
  },

  insertEvent(threadId: string, event: AgentEvent): void {
    db.insert(events).values({ threadId, data: JSON.stringify(event) }).run();
  },

  findEventsByThreadId(threadId: string): AgentEvent[] {
    const rows = db.select({ data: events.data }).from(events).where(eq(events.threadId, threadId)).all();
    return rows.map((r) => JSON.parse(r.data) as AgentEvent);
  },

  /** Mark orphaned running/queued threads as error on startup. */
  cleanupOrphaned(): number {
    const result = db.update(threads)
      .set({ status: 'error', error: 'Server restarted while investigation was in progress' })
      .where(inArray(threads.status, ['running', 'queued']))
      .run();
    return result.changes;
  },
});

export type ThreadRepository = ReturnType<typeof createThreadRepository>;
