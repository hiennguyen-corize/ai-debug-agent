/**
 * Network payload type.
 */

export type NetworkPayload = {
  requestUrl: string;
  requestMethod: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  responseTimeMs: number;
};
