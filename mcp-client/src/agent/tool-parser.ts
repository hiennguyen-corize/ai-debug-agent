/**
 * Tool call parser — extract tool calls from LLM responses.
 */

import { z } from 'zod';
import type OpenAI from 'openai';

export type ParsedToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

const ToolArgsSchema = z.record(z.string(), z.unknown());

const parseArguments = (raw: string): Record<string, unknown> => {
  try {
    return ToolArgsSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
};

export const parseToolCalls = (
  message: OpenAI.Chat.ChatCompletionMessage,
): ParsedToolCall[] => {
  const calls = message.tool_calls;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- OpenAI SDK types
  if (calls === undefined || calls === null) return [];
  return calls.map((call) => ({
    id: call.id,
    name: call.function.name,
    args: parseArguments(call.function.arguments),
  }));
};

export const hasToolCalls = (message: OpenAI.Chat.ChatCompletionMessage): boolean =>
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- OpenAI SDK types
  message.tool_calls !== undefined && message.tool_calls !== null && message.tool_calls.length > 0;

/** Extract thinking/reasoning from LLM responses — supports multiple model formats. */
export const extractThinking = (message: OpenAI.Chat.ChatCompletionMessage): string => {
  // 1. OpenAI-compatible reasoning field (Claude extended thinking, Gemini thinking)
  const reasoning = (message as unknown as Record<string, unknown>)['reasoning_content'];
  if (typeof reasoning === 'string' && reasoning.trim() !== '') return reasoning.trim();

  // 2. <think> tag format (Qwen3, DeepSeek R1)
  const content = message.content ?? '';
  const match = /<think>([\s\S]*?)<\/think>/g.exec(content);
  return match?.[1]?.trim() ?? '';
};

/** Get text content WITHOUT think blocks. */
export const getTextContent = (message: OpenAI.Chat.ChatCompletionMessage): string => {
  const content = message.content ?? '';
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
};
