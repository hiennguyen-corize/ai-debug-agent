/**
 * browser_upload_file tool definition.
 */

export const TOOL_UPLOAD_FILE = {
  NAME: 'browser_upload_file',
  DESCRIPTION: 'Upload a file to a file input element.',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    SELECTOR: 'CSS selector of the file input element',
    FILE_PATH: 'Absolute path to the file to upload',
  },
} as const;
