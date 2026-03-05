/**
 * Database client — Drizzle ORM + better-sqlite3.
 * Schema is defined in schema.ts (single source of truth).
 */

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.js';

const DB_PATH = process.env['DB_PATH'] ?? 'data/debug-agent.db';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

let instance: DrizzleDb | null = null;

export const getDb = (): DrizzleDb => {
  if (instance !== null) return instance;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  db.run(sql`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'running',
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

  instance = db;
  return instance;
};

export type AppDatabase = DrizzleDb;
