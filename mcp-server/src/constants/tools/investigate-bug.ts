/**
 * investigate_bug tool definition.
 */

export const TOOL_INVESTIGATE_BUG = {
  NAME: 'investigate_bug',
  DESCRIPTION:
    'Investigate a web application bug. Navigates to URL, observes behavior, builds hypotheses, and produces a root cause report with suggested fixes.',
  PARAMS: {
    URL: 'URL of the web application to investigate',
    HINT: 'Optional description of the bug or area to focus on',
    MODE: 'Investigation mode: "interactive" (asks user questions) or "autonomous" (self-assumes)',
    SOURCEMAP_DIR: 'Optional local directory containing source map files',
  },
} as const;
