/**
 * Report registry — JSON persistence + deduplication.
 */

import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { InvestigationReport, ReportSeverity } from '@ai-debug/shared';
import { RegistrySchema } from '#schemas/responses.js';

const REGISTRY_FILE = 'report-registry.json';
const REPORTS_DIR = './debug-reports';

type RegistryEntry = {
  id: string;
  url: string;
  severity: string;
  rootCause: string;
  filePath: string;
  timestamp: string;
};

type Registry = {
  reports: RegistryEntry[];
};

const loadRegistry = async (dir?: string): Promise<Registry> => {
  const filePath = join(dir ?? REPORTS_DIR, REGISTRY_FILE);
  try {
    const content = await readFile(filePath, 'utf-8');
    return RegistrySchema.parse(JSON.parse(content));
  } catch {
    return { reports: [] };
  }
};

const saveRegistry = async (registry: Registry, dir?: string): Promise<void> => {
  const dirPath = dir ?? REPORTS_DIR;
  await mkdir(dirPath, { recursive: true });
  const filePath = join(dirPath, REGISTRY_FILE);
  await writeFile(filePath, JSON.stringify(registry, null, 2), 'utf-8');
};

const computeSimilarity = (a: string, b: string): number => {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
};

export const isDuplicate = async (
  report: InvestigationReport,
  threshold?: number,
  dir?: string,
): Promise<boolean> => {
  const registry = await loadRegistry(dir);
  const limit = threshold ?? 0.85;
  return registry.reports.some((entry) =>
    entry.url === report.url && computeSimilarity(entry.rootCause, report.rootCause) >= limit,
  );
};

export const addToRegistry = async (
  report: InvestigationReport,
  filePath: string,
  dir?: string,
): Promise<void> => {
  const registry = await loadRegistry(dir);
  registry.reports.push({
    id: crypto.randomUUID(),
    url: report.url,
    severity: report.severity,
    rootCause: report.rootCause.slice(0, 200),
    filePath,
    timestamp: report.timestamp,
  });
  await saveRegistry(registry, dir);
};

export const listReports = async (
  filters?: { severity?: ReportSeverity; url?: string },
  dir?: string,
): Promise<RegistryEntry[]> => {
  const registry = await loadRegistry(dir);
  return registry.reports.filter((r) =>
    (filters?.severity === undefined || r.severity === filters.severity) &&
    (filters?.url === undefined || r.url.includes(filters.url)),
  );
};
