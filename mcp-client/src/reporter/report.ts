/**
 * Report generator — markdown report from InvestigationReport.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { InvestigationReport } from '@ai-debug/shared';

const REPORTS_DIR = './debug-reports';

const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1_000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes > 0 ? `${minutes.toString()}m ${remaining.toString()}s` : `${seconds.toString()}s`;
};

const buildHeader = (report: InvestigationReport): string[] => [
  `# 🐛 Bug Investigation Report`,
  '',
  `**URL:** ${report.url}`,
  `**Severity:** ${report.severity}`,
  `**Duration:** ${formatDuration(report.durationMs)}`,
  `**Date:** ${report.timestamp}`,
];

const buildRootCause = (report: InvestigationReport): string[] => [
  '', '## Summary', report.summary,
  '', '## Root Cause', report.rootCause,
];

const buildCodeLocation = (report: InvestigationReport): string[] => {
  if (report.codeLocation === null) return [];
  const lines = ['', '## Code Location',
    `- **File:** ${report.codeLocation.originalFile}`,
    `- **Line:** ${report.codeLocation.originalLine.toString()}`,
  ];
  if (report.codeLocation.codeSnippet !== '') {
    lines.push('```', report.codeLocation.codeSnippet, '```');
  }
  return lines;
};

const buildSuggestedFix = (report: InvestigationReport): string[] => {
  if (report.suggestedFix === null) return [];
  return ['', '## Suggested Fix',
    `**${report.suggestedFix.file}:${report.suggestedFix.line.toString()}**`,
    report.suggestedFix.explanation,
  ];
};

const buildReproSteps = (report: InvestigationReport): string[] => {
  if (report.reproSteps.length === 0) return [];
  return ['', '## Steps to Reproduce',
    ...report.reproSteps.map((step, i) => `${(i + 1).toString()}. ${step}`),
  ];
};

const buildEvidence = (report: InvestigationReport): string[] => [
  '', `## Evidence (${report.evidence.length.toString()} items)`,
  ...report.evidence.slice(0, 10).map((ev) => `- **[${ev.type}]** ${ev.description}`),
];

const buildMarkdown = (report: InvestigationReport): string => [
  ...buildHeader(report),
  ...buildRootCause(report),
  ...buildCodeLocation(report),
  ...buildSuggestedFix(report),
  ...buildReproSteps(report),
  ...buildEvidence(report),
].join('\n');

const generateFileName = (report: InvestigationReport): string => {
  const urlPart = new URL(report.url).pathname.replace(/\//g, '-').slice(0, 30);
  const datePart = new Date(report.timestamp).toISOString().slice(0, 10);
  return `${urlPart}-${datePart}.md`;
};

export const saveReport = async (
  report: InvestigationReport,
  reportsDir?: string,
): Promise<string> => {
  const dir = reportsDir ?? REPORTS_DIR;
  await mkdir(dir, { recursive: true });
  const fileName = generateFileName(report);
  const filePath = join(dir, fileName);
  await writeFile(filePath, buildMarkdown(report), 'utf-8');
  return filePath;
};
