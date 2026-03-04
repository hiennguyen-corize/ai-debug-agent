/**
 * Investigation logger — persists investigation steps to a markdown log file.
 *
 * Subscribes to EventBus and writes structured log in real-time.
 * Output: `logs/{timestamp}-{sanitized-url}.md`
 */

import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent } from '@ai-debug/shared';
import type { EventBus } from '#observability/event-bus.js';
import { aggregateEvent } from '#observability/step-aggregator.js';

const LOGS_DIR = 'logs';

const sanitizeFilename = (url: string): string =>
  url
    .replace(/https?:\/\//, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .slice(0, 60);

const formatTimestamp = (): string => {
  const d = new Date();
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${d.getFullYear().toString()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const formatStep = (event: AgentEvent): string => {
  const step = aggregateEvent(event);
  const time = step.timestamp.slice(11, 19);
  const agent = step.agent.toUpperCase().padEnd(12);

  switch (event.type) {
    case 'investigation_phase':
      return `\n## Phase: ${event.phase.toUpperCase()}\n_${time}_\n`;
    case 'reasoning':
      return `**[${time}] ${agent} 💭**\n${event.text}\n`;
    case 'tool_call':
      return `**[${time}] ${agent} 🔧 ${event.tool}**\n\`\`\`json\n${JSON.stringify(event.args, null, 2)}\n\`\`\`\n`;
    case 'tool_result':
      return `**[${time}] ${agent} ${event.success ? '✅' : '❌'} ${event.tool}** _(${event.durationMs.toString()}ms)_\n`;
    case 'hypothesis_created':
      return `**[${time}] ${agent} 🧪 Hypotheses**\n${event.hypotheses.map((h) => `- [${(h.confidence * 100).toFixed(0)}%] ${h.statement}`).join('\n')}\n`;
    case 'hypothesis_updated':
      return `**[${time}] ${agent} 🔄 Hypothesis Updated** → ${event.id} (${(event.newConfidence * 100).toFixed(0)}%)\n`;
    case 'error':
      return `**[${time}] ${agent} ⚠️ ERROR**\n> ${event.message}\n`;
    case 'llm_usage':
      return `_[${time}] tokens: ${event.promptTokens.toString()} prompt + ${event.completionTokens.toString()} completion_\n`;
    case 'sourcemap_resolved':
      return `**[${time}] 🗺️ Source Map Resolved** → ${event.originalFile}:${event.line.toString()}\n`;
    case 'sourcemap_failed':
      return `**[${time}] 🗺️ Source Map Failed** → ${event.reason}\n`;
    case 'user_question':
      return `**[${time}] ❓ Agent asks user:** ${event.question}\n`;
    case 'user_answered':
      return `**[${time}] 💬 User answered:** ${event.question}\n`;
  }
};

type InvestigationLogger = {
  filePath: string;
  unsubscribe: () => void;
};

export const createInvestigationLogger = async (
  eventBus: EventBus,
  url: string,
  hint?: string,
  logsDir?: string,
): Promise<InvestigationLogger> => {
  const dir = logsDir ?? LOGS_DIR;
  await mkdir(dir, { recursive: true });

  const filename = `${formatTimestamp()}-${sanitizeFilename(url)}.md`;
  const filePath = join(dir, filename);

  const header = [
    `# Investigation Log`,
    ``,
    `- **URL**: ${url}`,
    hint !== undefined ? `- **Hint**: ${hint}` : '',
    `- **Started**: ${new Date().toISOString()}`,
    ``,
    `---`,
    ``,
  ].filter(Boolean).join('\n');

  await writeFile(filePath, header, 'utf-8');

  const unsubscribe = eventBus.subscribe((event: AgentEvent) => {
    const formatted = formatStep(event);
    void appendFile(filePath, `${formatted}\n`, 'utf-8');
  });

  return { filePath, unsubscribe };
};
