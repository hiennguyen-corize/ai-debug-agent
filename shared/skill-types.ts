/**
 * Skill system types — modular agent capabilities.
 */

export const SKILL_CATEGORY = {
  FRAMEWORK: 'framework',
  BUG_PATTERN: 'bug-pattern',
  AUTH: 'auth',
  SOURCE_MAP: 'source-map',
  BROWSER: 'browser',
  REPORT: 'report',
} as const;

export type SkillCategory = (typeof SKILL_CATEGORY)[keyof typeof SKILL_CATEGORY];

export type SkillMetadata = {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  detectionSignals: string[];
  priority: number;
};

export type Skill = SkillMetadata & {
  instructions: string;
  toolChain: string[];
  hypothesisTemplates: string[];
  alwaysActive?: boolean;
};
