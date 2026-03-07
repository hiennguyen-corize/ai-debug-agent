/**
 * Investigation logger — persists investigation steps to a markdown log file.
 */

import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent } from '@ai-debug/shared';
import type { EventBus } from '#observability/event-bus.js';
import { aggregateEvent } from '#observability/step-aggregator.js';

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
    case 'tool_result': {
      const status = event.success ? '✅' : '❌';
      const header = `**[${time}] ${agent} ${status} ${event.tool}** _(${event.durationMs.toString()}ms)_`;
      if (event.result !== undefined && event.result.length > 0) {
        const truncated = event.result.length > 500 ? `${event.result.slice(0, 500)}…` : event.result;
        return `${header}\n\`\`\`\n${truncated}\n\`\`\`\n`;
      }
      return `${header}\n`;
    }
    case 'error':
      return `**[${time}] ${agent} ⚠️ ERROR**\n> ${event.message}\n`;
    case 'llm_usage':
      return `_[${time}] tokens: ${event.promptTokens.toString()} prompt + ${event.completionTokens.toString()} completion_\n`;
    case 'sourcemap_resolved':
      return `**[${time}] 🗺️ Source Map Resolved** → ${event.originalFile}:${event.line.toString()}\n`;
    case 'sourcemap_failed':
      return `**[${time}] 🗺️ Source Map Failed** → ${event.reason}\n`;
    case 'screenshot_captured':
      return `**[${time}] 📸 Screenshot captured**\n`;
    case 'waiting_for_input':
      return `**[${time}] ⏸️ Waiting for user input:** ${event.prompt}\n`;
    case 'investigation_queued':
      return `**[${time}] 📋 Queued** position ${event.position.toString()}: ${event.message}\n`;
  }
};

type InvestigationLogger = {
  filePath: string;
  unsubscribe: () => void;
  writeFooter: () => Promise<void>;
};

const COST_PER_1M_INPUT = 0.15;
const COST_PER_1M_OUTPUT = 0.60;

export const createInvestigationLogger = async (
  eventBus: EventBus,
  url: string,
  hint?: string,
  logsDir?: string,
): Promise<InvestigationLogger> => {
  const dir = logsDir ?? 'logs';
  await mkdir(dir, { recursive: true });

  const filename = `${formatTimestamp()}-${sanitizeFilename(url)}.md`;
  const filePath = join(dir, filename);
  const startTime = Date.now();

  const header = [
    `# Investigation Log`,
    `- **URL**: ${url}`,
    hint !== undefined ? `- **Hint**: ${hint}` : '',
    `- **Started**: ${new Date().toISOString()}`,
    `---`,
  ].filter(Boolean).join('\n');

  await writeFile(filePath, header, 'utf-8');

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let llmCalls = 0;

  const unsubscribe = eventBus.subscribe((event: AgentEvent) => {
    const formatted = formatStep(event);
    void appendFile(filePath, `${formatted}\n`, 'utf-8');

    if (event.type === 'llm_usage') {
      totalPromptTokens += event.promptTokens;
      totalCompletionTokens += event.completionTokens;
      llmCalls++;
    }
  });

  const writeFooter = async (): Promise<void> => {
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const inputCost = (totalPromptTokens / 1_000_000) * COST_PER_1M_INPUT;
    const outputCost = (totalCompletionTokens / 1_000_000) * COST_PER_1M_OUTPUT;
    const totalCost = inputCost + outputCost;

    const footer = [
      `\n---`,
      `## 📊 Usage Summary`,
      `| | Prompt | Completion | Total |`,
      `|---|--------|------------|-------|`,
      `| Tokens | ${totalPromptTokens.toLocaleString()} | ${totalCompletionTokens.toLocaleString()} | ${totalTokens.toLocaleString()} |`,
      `| Cost | $${inputCost.toFixed(4)} | $${outputCost.toFixed(4)} | **$${totalCost.toFixed(4)}** |`,
      `- **LLM Calls**: ${llmCalls.toString()}`,
      `- **Duration**: ${durationSec}s`,
    ].join('\n');

    await appendFile(filePath, footer, 'utf-8');
  };

  return { filePath, unsubscribe, writeFooter };
};
