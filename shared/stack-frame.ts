/**
 * Parsed stack trace types — structured representation of console error stack traces.
 */

export type ParsedStackFrame = {
  file: string;
  line: number;
  column: number;
  functionName: string | null;
  raw: string;
};

export type ParsedError = {
  message: string;
  frames: ParsedStackFrame[];
  raw: string;
};
