/**
 * Database migrations — create tables and indexes.
 * Separated from connection logic for single responsibility.
 */

import { sql } from 'drizzle-orm';
import type { AppDatabase } from './client.js';

export const runMigrations = (db: AppDatabase): void => {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'queued',
      url TEXT NOT NULL,
      hint TEXT DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'interactive',
      report TEXT,
      error TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`CREATE INDEX IF NOT EXISTS idx_events_thread_id ON events(thread_id)`);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_call_id TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`CREATE INDEX IF NOT EXISTS idx_artifacts_thread_id ON artifacts(thread_id)`);
};
