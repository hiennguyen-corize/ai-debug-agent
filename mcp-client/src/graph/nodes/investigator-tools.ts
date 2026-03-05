/**
 * Investigator tool definitions for LLM function calling.
 */

import { TOOL_NAME } from '@ai-debug/shared';
import type OpenAI from 'openai';

export const INVESTIGATOR_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: TOOL_NAME.DISPATCH_BROWSER_TASK,
      description: 'Send a browser task to the Explorer agent for execution. Use this to interact with the page (click, fill, navigate, inspect elements).',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'What the Explorer should do (e.g., "Click the login button and observe network requests")' },
          stopCondition: { type: 'string', description: 'When to stop (e.g., "When the response is received")' },
          collectEvidence: { type: 'array', items: { type: 'string' }, description: 'Evidence types to collect: "console", "network", "dom", "screenshot"' },
        },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.FETCH_SOURCE_MAP,
      description: 'Fetch and parse the source map for a JavaScript bundle URL. Returns the original source files and mappings.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL of the JavaScript bundle to fetch the source map for' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.RESOLVE_ERROR_LOCATION,
      description: 'Resolve a minified error location (line:column) to the original source file and line using a previously fetched source map.',
      parameters: {
        type: 'object',
        properties: {
          bundleUrl: { type: 'string', description: 'The URL of the bundle that was previously fetched' },
          line: { type: 'number', description: 'Line number in the minified bundle' },
          column: { type: 'number', description: 'Column number in the minified bundle' },
        },
        required: ['bundleUrl', 'line', 'column'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.READ_SOURCE_FILE,
      description: 'Read lines from a source file (original, not minified) by line range.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Path to the source file' },
          startLine: { type: 'number', description: 'Start line (1-indexed)' },
          endLine: { type: 'number', description: 'End line (1-indexed)' },
        },
        required: ['file', 'startLine', 'endLine'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.FINISH_INVESTIGATION,
      description: 'Finish the investigation and trigger synthesis of the final report. Call this when you have gathered enough evidence to identify the root cause.',
      parameters: {
        type: 'object',
        properties: {
          rootCause: { type: 'string', description: 'Brief root cause statement' },
          confidence: { type: 'number', description: 'Confidence score 0-1' },
          summary: { type: 'string', description: 'Summary of evidence gathered' },
        },
        required: ['rootCause', 'confidence'],
      },
    },
  },
];
