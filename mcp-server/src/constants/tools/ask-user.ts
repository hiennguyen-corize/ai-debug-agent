/**
 * ask_user tool definition.
 */

export const TOOL_ASK_USER = {
  NAME: 'ask_user',
  DESCRIPTION: 'Ask the user a question for clarification (interactive mode only).',
  PARAMS: {
    QUESTION: 'Question to ask the user',
    CONTEXT: 'Why this question is needed',
    ATTEMPTS: 'Number of investigation attempts made so far',
  },
} as const;
