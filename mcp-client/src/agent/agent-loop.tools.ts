/**
 * Tool definitions for the agent loop.
 */

import type OpenAI from 'openai';

export const FINISH_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'finish_investigation',
    description: 'Submit your bug report after completing analysis. Include source map findings if available.',
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
        codeLocation: {
          type: 'object',
          description: 'Source code location of the bug (from source maps or minified JS)',
          properties: {
            file: { type: 'string', description: 'Source file path or bundle URL' },
            line: { type: 'number', description: 'Line number' },
            column: { type: 'number', description: 'Column number' },
            snippet: { type: 'string', description: 'Code snippet around the error' },
          },
          required: ['file', 'line'],
        },
        networkFindings: {
          type: 'array',
          items: { type: 'string' },
          description: 'Relevant network requests/responses that contributed to the bug',
        },
        timeline: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered sequence of events leading to the bug (e.g. "[action] Click Apply", "[network] POST /coupon → 200", "[console] TypeError")',
        },
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

export const ASK_USER_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'ask_user',
    description: 'Ask the user a question when you need clarification or guidance. Use when: multiple possible bugs found, ambiguous behavior, or need user to reproduce a specific step.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask the user' },
        context: { type: 'string', description: 'Brief context: what you found so far and why you need input' },
      },
      required: ['question', 'context'],
    },
  },
};

export const isAskUserTool = (name: string): boolean => name === 'ask_user';

export const FETCH_JS_SNIPPET_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'fetch_js_snippet',
    description: 'Fetch minified JavaScript source and show lines around a specific line number. Use when source maps are unavailable to read code context around an error.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL of the JavaScript file' },
        line: { type: 'number', description: 'Line number from the stack trace' },
        context: { type: 'number', description: 'Number of lines before/after to show (default: 10)' },
      },
      required: ['url', 'line'],
    },
  },
};

export const isFetchJsSnippetTool = (name: string): boolean => name === 'fetch_js_snippet';
