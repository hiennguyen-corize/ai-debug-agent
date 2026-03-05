/**
 * Explorer tool definitions for LLM function calling.
 */

import { TOOL_NAME } from '@ai-debug/shared';
import type OpenAI from 'openai';

export const EXPLORER_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: TOOL_NAME.BROWSER_NAVIGATE,
      description: 'Navigate to a URL in the browser.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to navigate to' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.BROWSER_GET_DOM,
      description: 'Get the DOM snapshot of the current page.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Browser session ID' },
        },
        required: ['sessionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.GET_CONSOLE_LOGS,
      description: 'Fetch console logs (errors, warnings, info) from the browser.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Browser session ID' },
        },
        required: ['sessionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.GET_NETWORK_LOGS,
      description: 'Fetch network request logs (API calls, status codes, URLs).',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Browser session ID' },
        },
        required: ['sessionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.BROWSER_SCREENSHOT,
      description: 'Take a screenshot of the current page.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Browser session ID' },
        },
        required: ['sessionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.BROWSER_CLICK,
      description: 'Click an element on the page by CSS selector.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Browser session ID' },
          selector: { type: 'string', description: 'CSS selector of element to click' },
        },
        required: ['sessionId', 'selector'],
      },
    },
  },
];
