/**
 * Source map fetcher — 3-strategy fallback.
 */

import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, join } from 'node:path';
import type { SourceMapResult, SourceMapConfig } from './types.js';
import { extractSourceMappingUrl } from './fallback.js';

const DEFAULT_BUILD_DIRS = ['./dist', './build', './.next', './out'];

type ParsedMap = {
  sources: string[];
  rawMap: unknown;
};

const extractSources = (parsed: unknown): string[] => {
  if (typeof parsed !== 'object' || parsed === null || !('sources' in parsed)) return [];
  const { sources } = parsed as Record<string, unknown>;
  return Array.isArray(sources) ? sources.filter((s): s is string => typeof s === 'string') : [];
};

const parseSourceMap = (raw: string): ParsedMap => {
  const parsed: unknown = JSON.parse(raw);
  return { sources: extractSources(parsed), rawMap: parsed };
};

const buildResult = (origin: SourceMapResult['origin'], mapUrl: string, parsed: ParsedMap): SourceMapResult => ({
  success: true,
  origin,
  mapUrl,
  sourcesCount: parsed.sources.length,
  rawMap: parsed.rawMap,
});

const fetchFromPublicUrl = async (bundleUrl: string): Promise<SourceMapResult | null> => {
  const mapUrl = await extractSourceMappingUrl(bundleUrl);
  if (mapUrl === null) return null;
  try {
    const res = await fetch(mapUrl);
    if (!res.ok) return null;
    return buildResult('public_url', mapUrl, parseSourceMap(await res.text()));
  } catch { return null; }
};

const fetchFromLocalPath = async (localPath: string): Promise<SourceMapResult | null> => {
  try {
    await access(localPath, constants.R_OK);
    const content = await readFile(localPath, 'utf-8');
    return buildResult('local_path', localPath, parseSourceMap(content));
  } catch { return null; }
};

const fetchFromBuildDir = async (
  bundleUrl: string,
  buildDirs: string[],
): Promise<SourceMapResult | null> => {
  const mapFileName = `${basename(new URL(bundleUrl).pathname)}.map`;
  for (const dir of buildDirs) {
    const candidate = join(dir, mapFileName);
    try {
      await access(candidate, constants.R_OK);
      const content = await readFile(candidate, 'utf-8');
      return buildResult('build_dir_scan', candidate, parseSourceMap(content));
    } catch { /* skip */ }
  }
  return null;
};

export const fetchSourceMap = async (
  bundleUrl: string,
  config?: SourceMapConfig,
): Promise<SourceMapResult> => {
  const publicResult = await fetchFromPublicUrl(bundleUrl);
  if (publicResult !== null) return publicResult;

  if (config?.localPath !== undefined) {
    const localResult = await fetchFromLocalPath(config.localPath);
    if (localResult !== null) return localResult;
  }

  const buildDirs = config?.buildDir !== undefined ? [config.buildDir] : DEFAULT_BUILD_DIRS;
  const buildResult = await fetchFromBuildDir(bundleUrl, buildDirs);
  if (buildResult !== null) return buildResult;

  return { success: false, origin: 'not_found', mapUrl: '', sourcesCount: 0, rawMap: null };
};
