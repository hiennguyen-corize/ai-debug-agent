/**
 * Database client — Drizzle ORM + better-sqlite3.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.js';

const DB_PATH = 'data/debug-agent.db';

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'running',
    url TEXT NOT NULL,
    hint TEXT DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'interactive',
    report TEXT,
    error TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_thread_id ON events(thread_id);
`;

let instance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export const getDb = () => {
  if (instance !== null) return instance;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(INIT_SQL);

  instance = drizzle(sqlite, { schema });
  return instance;
};

export type AppDatabase = ReturnType<typeof getDb>;
