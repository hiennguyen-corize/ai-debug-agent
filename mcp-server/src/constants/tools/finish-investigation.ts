/**
 * finish_investigation tool definition.
 */

export const TOOL_FINISH_INVESTIGATION = {
  NAME: 'finish_investigation',
  DESCRIPTION: 'Signal that the investigation is complete and trigger synthesis of the final report.',
  PARAMS: {
    REASON: 'Why the investigation is being concluded',
    CONFIDENT: 'Whether the investigator is confident in the findings',
  },
} as const;
