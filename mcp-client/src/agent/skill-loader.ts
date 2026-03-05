/**
 * Skill loader — reads .skill.md files, parses YAML frontmatter + markdown body.
 *
 * Skill file format:
 * ---
 * id: api-error
 * name: API Error
 * category: bug-pattern
 * detectionSignals: [network 4xx, network 5xx]
 * priority: 90
 * toolChain: [get_network_logs, get_network_payload]
 * hypothesisTemplates: [API returns error status]
 * ---
 * # Investigation instructions (markdown body)
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Skill, SkillCategory } from '@ai-debug/shared';

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

const parseYamlValue = (raw: string): string | string[] => {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim());
  }
  return trimmed;
};

const parseFrontmatter = (content: string): { meta: Record<string, string | string[]>; body: string } | undefined => {
  const match = FRONTMATTER_REGEX.exec(content);
  if (match === null) return undefined;

  const rawMeta = match[1] ?? '';
  const rawBody = match[2] ?? '';

  const meta: Record<string, string | string[]> = {};
  for (const line of rawMeta.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1);
    meta[key] = parseYamlValue(val);
  }

  return { meta, body: rawBody.trim() };
};

const toSkill = (meta: Record<string, string | string[]>, body: string): Skill => ({
  id: String(meta['id'] ?? ''),
  name: String(meta['name'] ?? ''),
  category: String(meta['category'] ?? 'bug-pattern') as SkillCategory,
  description: String(meta['description'] ?? ''),
  detectionSignals: Array.isArray(meta['detectionSignals']) ? meta['detectionSignals'] : [],
  priority: Number(meta['priority'] ?? 50),
  instructions: body,
  toolChain: Array.isArray(meta['toolChain']) ? meta['toolChain'] : [],
  hypothesisTemplates: Array.isArray(meta['hypothesisTemplates']) ? meta['hypothesisTemplates'] : [],
  alwaysActive: String(meta['alwaysActive'] ?? 'false') === 'true',
});

export const loadSkillFile = async (filePath: string): Promise<Skill | undefined> => {
  const content = await readFile(filePath, 'utf-8');
  const parsed = parseFrontmatter(content);
  if (parsed === undefined) return undefined;
  return toSkill(parsed.meta, parsed.body);
};

export const loadSkillsFromDir = async (dirPath: string): Promise<Skill[]> => {
  const absDir = resolve(dirPath);
  const skills: Skill[] = [];

  let entries: string[];
  try {
    entries = await readdir(absDir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.endsWith('.skill.md')) continue;
    const skill = await loadSkillFile(join(absDir, entry));
    if (skill !== undefined) skills.push(skill);
  }

  return skills;
};

export const loadAllSkills = async (skillsRoot: string): Promise<Skill[]> => {
  const absRoot = resolve(skillsRoot);
  const all: Skill[] = [];
  const seen = new Set<string>();

  let entries: string[];
  try {
    entries = await readdir(absRoot);
  } catch {
    return [];
  }

  for (const entry of entries) {
    const dirPath = join(absRoot, entry);
    const skills = await loadSkillsFromDir(dirPath);
    for (const s of skills) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        all.push(s);
      }
    }
  }

  return all;
};

export { parseFrontmatter as _parseFrontmatter };
