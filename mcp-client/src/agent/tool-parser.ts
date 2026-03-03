/**
 * Tool call parser — extract tool calls from LLM responses.
 */

import type OpenAI from 'openai';

export type ParsedToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

const parseArguments = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const parseToolCalls = (
  message: OpenAI.Chat.ChatCompletionMessage,
): ParsedToolCall[] => {
  const calls = message.tool_calls;
  if (calls === undefined || calls === null) return [];
  return calls.map((call) => ({
    id: call.id,
    name: call.function.name,
    args: parseArguments(call.function.arguments),
  }));
};

export const hasToolCalls = (message: OpenAI.Chat.ChatCompletionMessage): boolean =>
  message.tool_calls !== undefined && message.tool_calls !== null && message.tool_calls.length > 0;

export const getTextContent = (message: OpenAI.Chat.ChatCompletionMessage): string =>
  message.content ?? '';
