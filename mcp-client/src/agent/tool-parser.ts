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

export const getTextContent = (message: OpenAI.Chat.ChatCompletionMessage): string =>
  message.content ?? '';
