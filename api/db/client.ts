/**
 * Database client — Drizzle ORM + better-sqlite3.
 * Schema is defined in schema.ts (single source of truth).
 * Migrations are in migrate.ts.
 */

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.js';
import { runMigrations } from './migrate.js';

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

  runMigrations(db);

  instance = db;
  return instance;
};

export type AppDatabase = DrizzleDb;
