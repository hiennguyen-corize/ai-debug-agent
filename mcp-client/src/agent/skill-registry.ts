/**
 * Skill Registry — in-memory registry for loaded skills.
 * Resolves observed signals to ranked skill matches.
 */

import type { Skill, SkillCategory } from '@ai-debug/shared';

type SignalInput = {
  consoleErrors: string[];
  networkErrors: string[];
  domObservations: string[];
  detectedFrameworks: string[];
};

type SkillMatch = {
  skill: Skill;
  matchedSignals: string[];
  confidence: number;
};

export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  registerAll(skills: Skill[]): void {
    for (const s of skills) this.register(s);
  }

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getByCategory(category: SkillCategory): Skill[] {
    return [...this.skills.values()].filter((s) => s.category === category);
  }

  resolveSkills(input: SignalInput): SkillMatch[] {
    const allSignals = [
      ...input.consoleErrors,
      ...input.networkErrors,
      ...input.domObservations,
      ...input.detectedFrameworks,
    ].map((s) => s.toLowerCase());

    const matches: SkillMatch[] = [];

    for (const skill of this.skills.values()) {
      const matchedSignals: string[] = [];

      for (const signal of skill.detectionSignals) {
        const lower = signal.toLowerCase();
        if (allSignals.some((s) => s.includes(lower) || lower.includes(s))) {
          matchedSignals.push(signal);
        }
      }

      if (matchedSignals.length === 0) continue;

      const confidence = (matchedSignals.length / skill.detectionSignals.length) * (skill.priority / 100);
      matches.push({ skill, matchedSignals, confidence });
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  getAlwaysActive(): Skill[] {
    return [...this.skills.values()].filter((s) => s.alwaysActive === true);
  }

  buildPromptContext(skillIds: string[]): string {
    const sections: string[] = [];
    const seen = new Set<string>();

    // Always-active skills first
    for (const skill of this.getAlwaysActive()) {
      seen.add(skill.id);
      sections.push(`## [Skill: ${skill.name}]\n\n${skill.instructions}`);
    }

    // Then matched skills
    for (const id of skillIds) {
      if (seen.has(id)) continue;
      const skill = this.skills.get(id);
      if (skill === undefined) continue;
      sections.push(`## [Skill: ${skill.name}]\n\n${skill.instructions}`);
    }

    return sections.join('\n\n---\n\n');
  }

  get size(): number {
    return this.skills.size;
  }
}
