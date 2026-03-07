/**
 * Error location parsing from console error strings.
 */

import type { ParsedErrorLocation } from './types.js';

const ERROR_LOCATION_PATTERN = /(?:at\s+.*?\(|@)(https?:\/\/[^:]+):(\d+):(\d+)/;
const SIMPLE_LOCATION_PATTERN = /(https?:\/\/[^:]+\.js):(\d+):(\d+)/;

export const parseErrorLocation = (errorString: string): ParsedErrorLocation | null => {
  const match = ERROR_LOCATION_PATTERN.exec(errorString) ?? SIMPLE_LOCATION_PATTERN.exec(errorString);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  return {
    bundleUrl: match[1],
    line: Number(match[2]),
    column: Number(match[3]),
  };
};

export const extractSourceMappingUrl = async (bundleUrl: string): Promise<string | null> => {
  try {
    const response = await fetch(bundleUrl);
    if (!response.ok) return null;
    const text = await response.text();
    const match = /\/\/[@#]\s*sourceMappingURL=(.+?)(?:\s|$)/.exec(text);
    if (match?.[1] === undefined) return null;

    const mapRef = match[1];
    if (mapRef.startsWith('http')) return mapRef;

    const baseUrl = new URL(bundleUrl);
    return new URL(mapRef, baseUrl).toString();
  } catch { return null; }
};
