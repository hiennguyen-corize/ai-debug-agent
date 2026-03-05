/**
 * Stack trace parser — extract structured frames from console error text.
 *
 * Supports Chrome, Firefox, and Safari stack trace formats.
 */

import type { ParsedError, ParsedStackFrame } from '@ai-debug/shared';

// Chrome/Node: "    at functionName (http://localhost:5173/src/file.js:42:15)"
//              "    at http://localhost:5173/src/file.js:42:15"
const CHROME_FRAME = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/;

// Firefox/Safari: "functionName@http://localhost:5173/src/file.js:42:15"
//                 "@http://localhost:5173/src/file.js:42:15"
const FIREFOX_FRAME = /^(.*)@(.+?):(\d+):(\d+)$/;

const parseFrame = (raw: string): ParsedStackFrame | null => {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const chromeMatch = CHROME_FRAME.exec(trimmed);
  if (chromeMatch !== null) {
    return {
      functionName: chromeMatch[1] ?? null,
      file: chromeMatch[2] ?? '',
      line: Number(chromeMatch[3] ?? 0),
      column: Number(chromeMatch[4] ?? 0),
      raw: trimmed,
    };
  }

  const firefoxMatch = FIREFOX_FRAME.exec(trimmed);
  if (firefoxMatch !== null) {
    return {
      functionName: (firefoxMatch[1] ?? '') !== '' ? (firefoxMatch[1] ?? null) : null,
      file: firefoxMatch[2] ?? '',
      line: Number(firefoxMatch[3] ?? 0),
      column: Number(firefoxMatch[4] ?? 0),
      raw: trimmed,
    };
  }

  return null;
};

export const parseStackTrace = (errorText: string): ParsedError => {
  const lines = errorText.split('\n');

  // First non-frame line is the error message
  let messageEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (trimmed.startsWith('at ') || FIREFOX_FRAME.test(trimmed)) {
      messageEnd = i;
      break;
    }
    messageEnd = i + 1;
  }

  const message = lines.slice(0, messageEnd).join('\n').trim();
  const frameLines = lines.slice(messageEnd);

  const frames: ParsedStackFrame[] = [];
  for (const line of frameLines) {
    const frame = parseFrame(line);
    if (frame !== null) frames.push(frame);
  }

  return { message, frames, raw: errorText };
};
