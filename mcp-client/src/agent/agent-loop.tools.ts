/**
 * Tool definitions for the agent loop.
 */

import type OpenAI from 'openai';

export const FINISH_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'finish_investigation',
    description: 'STOP the investigation and submit your bug report NOW. Call this AS SOON AS you find a bug — do not continue testing.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of the bug found' },
        rootCause: { type: 'string', description: 'Technical root cause analysis' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        stepsToReproduce: { type: 'array', items: { type: 'string' }, description: 'Steps to reproduce the bug' },
        evidence: {
          type: 'object',
          properties: {
            consoleErrors: { type: 'array', items: { type: 'string' } },
            networkErrors: { type: 'array', items: { type: 'string' } },
          },
        },
        suggestedFix: { type: 'string', description: 'Suggested fix (if determinable)' },
      },
      required: ['summary', 'rootCause', 'severity', 'stepsToReproduce', 'evidence'],
    },
  },
};

export const SOURCE_MAP_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_source_map',
      description: 'Fetch and parse a JavaScript source map from a bundle URL',
      parameters: {
        type: 'object',
        properties: { bundleUrl: { type: 'string' } },
        required: ['bundleUrl'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_error_location',
      description: 'Map a minified line:column to original source using a fetched source map',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          line: { type: 'number' },
          column: { type: 'number' },
        },
        required: ['url', 'line', 'column'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_source_file',
      description: 'Read original source code from a source map',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          filePath: { type: 'string' },
          startLine: { type: 'number' },
          endLine: { type: 'number' },
        },
        required: ['url', 'filePath'],
      },
    },
  },
];

const SOURCE_MAP_TOOL_NAMES = new Set(['fetch_source_map', 'resolve_error_location', 'read_source_file']);

export const isSourceMapTool = (name: string): boolean => SOURCE_MAP_TOOL_NAMES.has(name);
