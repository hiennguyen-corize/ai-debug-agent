/**
 * read_source_file tool definition.
 */

export const TOOL_READ_SOURCE_FILE = {
  NAME: 'read_source_file',
  DESCRIPTION: 'Read source code from a file by line range. Works with source map or local filesystem.',
  PARAMS: {
    FILE_PATH: 'Path to the source file',
    LINE_FROM: 'Start line number (1-indexed)',
    LINE_TO: 'End line number (inclusive)',
  },
} as const;
