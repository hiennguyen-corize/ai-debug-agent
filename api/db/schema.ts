/**
 * Drizzle ORM schema — source of truth for database structure.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { ThreadStatus, InvestigationMode } from '@ai-debug/shared';

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  status: text('status').$type<ThreadStatus>().notNull().default('running'),
  url: text('url').notNull(),
  hint: text('hint').default(''),
  mode: text('mode').$type<InvestigationMode>().notNull().default('interactive'),
  report: text('report'),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: text('thread_id').notNull().references(() => threads.id, { onDelete: 'cascade' }),
  data: text('data').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
export type ThreadEvent = typeof events.$inferSelect;
export type NewThreadEvent = typeof events.$inferInsert;
