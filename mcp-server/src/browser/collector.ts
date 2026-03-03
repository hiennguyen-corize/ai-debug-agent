/**
 * Evidence collector with correlation tracing.
 */

import type { Page, Request, Response, ConsoleMessage } from 'playwright';
import type { CapturedRequest, CapturedLog, CorrelatedEvidence, ConsoleLogType, NetworkPayload } from '../types/index.js';
import { CORRELATION_WINDOW_MS, CONSOLE_LOG_TYPE, HTTP_ERROR_MIN_STATUS, RESPONSE_BODY_MAX_BYTES, isConsoleLogType } from '../constants.js';

const toConsoleLogType = (raw: string): ConsoleLogType =>
  isConsoleLogType(raw) ? raw : CONSOLE_LOG_TYPE.LOG;

const buildCapturedRequest = (request: Request, actionId: string): CapturedRequest => ({
  actionId,
  method: request.method(),
  url: request.url(),
  status: 0,
  requestStart: Date.now(),
  responseEnd: 0,
  durationMs: 0,
  initiator: request.frame()?.url() ?? 'unknown',
});

const updateRequestWithResponse = (log: CapturedRequest, response: Response): void => {
  const now = Date.now();
  log.status = response.status();
  log.responseEnd = now;
  log.durationMs = now - log.requestStart;
};

const findPendingRequest = (logs: CapturedRequest[], url: string): CapturedRequest | undefined => {
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    if (log !== undefined && log.url === url && log.status === 0) return log;
  }
  return undefined;
};

const buildConsoleLog = (actionId: string, msg: ConsoleMessage): CapturedLog => ({
  actionId,
  type: toConsoleLogType(msg.type()),
  text: msg.text(),
  timestamp: Date.now(),
});

type StoredPayload = {
  request: Request;
  response: Response;
};

const safeResponseBody = async (response: Response): Promise<string> => {
  try {
    const body = await response.body();
    return body.length > RESPONSE_BODY_MAX_BYTES
      ? body.subarray(0, RESPONSE_BODY_MAX_BYTES).toString('utf-8') + '…[truncated]'
      : body.toString('utf-8');
  } catch { return ''; }
};

const headersToRecord = (headers: Record<string, string>): Record<string, string> => ({ ...headers });

export class PageCollector {
  private networkLogs: CapturedRequest[] = [];
  private consoleLogs: CapturedLog[] = [];
  private payloads: StoredPayload[] = [];
  private activeActionId = 'passive';
  private listening = false;

  private readonly onRequest = (request: Request): void => {
    this.networkLogs.push(buildCapturedRequest(request, this.activeActionId));
  };

  private readonly onResponse = (response: Response): void => {
    const pending = findPendingRequest(this.networkLogs, response.url());
    if (pending !== undefined) updateRequestWithResponse(pending, response);
    this.payloads.push({ request: response.request(), response });
  };

  private readonly onConsole = (msg: ConsoleMessage): void => {
    this.consoleLogs.push(buildConsoleLog(this.activeActionId, msg));
  };

  start = (page: Page): void => {
    if (this.listening) return;
    this.listening = true;
    page.on('request', this.onRequest);
    page.on('response', this.onResponse);
    page.on('console', this.onConsole);
  };

  stop = (page: Page): void => {
    if (!this.listening) return;
    this.listening = false;
    page.off('request', this.onRequest);
    page.off('response', this.onResponse);
    page.off('console', this.onConsole);
  };

  setActiveAction = (actionId: string): void => {
    this.activeActionId = actionId;
  };

  getNetworkLogs = (): CapturedRequest[] => [...this.networkLogs];
  getConsoleLogs = (): CapturedLog[] => [...this.consoleLogs];
  getConsoleErrors = (): CapturedLog[] => this.consoleLogs.filter((l) => l.type === CONSOLE_LOG_TYPE.ERROR);
  getNetworkErrors = (): CapturedRequest[] => this.networkLogs.filter((l) => l.status >= HTTP_ERROR_MIN_STATUS);

  getPayloadForUrl = async (urlPattern: string): Promise<NetworkPayload[]> => {
    const matches = this.payloads.filter((p) => p.request.url().includes(urlPattern));
    const results: NetworkPayload[] = [];
    for (const m of matches) {
      results.push({
        requestUrl: m.request.url(),
        requestMethod: m.request.method(),
        requestHeaders: headersToRecord(m.request.headers()),
        requestBody: m.request.postData() ?? null,
        responseStatus: m.response.status(),
        responseHeaders: headersToRecord(await m.response.allHeaders()),
        responseBody: await safeResponseBody(m.response),
        responseTimeMs: 0,
      });
    }
    return results;
  };

  clear = (): void => {
    this.networkLogs = [];
    this.consoleLogs = [];
    this.payloads = [];
  };
}

const attachListeners = (
  page: Page,
  actionId: string,
  networkEvents: CapturedRequest[],
  consoleEvents: CapturedLog[],
  startTime: number,
): { detach: () => void } => {
  const isWithinWindow = (): boolean => Date.now() - startTime <= CORRELATION_WINDOW_MS;

  const onRequest = (request: Request): void => {
    if (isWithinWindow()) networkEvents.push(buildCapturedRequest(request, actionId));
  };
  const onResponse = (response: Response): void => {
    const pending = findPendingRequest(networkEvents, response.url());
    if (pending !== undefined) updateRequestWithResponse(pending, response);
  };
  const onConsole = (msg: ConsoleMessage): void => {
    if (isWithinWindow()) consoleEvents.push(buildConsoleLog(actionId, msg));
  };

  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('console', onConsole);

  return {
    detach: (): void => {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('console', onConsole);
    },
  };
};

export const executeAndCollect = async (
  page: Page,
  action: () => Promise<void>,
  actionLabel: string,
): Promise<CorrelatedEvidence> => {
  const actionId = crypto.randomUUID();
  const startTime = Date.now();
  const networkEvents: CapturedRequest[] = [];
  const consoleEvents: CapturedLog[] = [];

  const { detach } = attachListeners(page, actionId, networkEvents, consoleEvents, startTime);

  await action();
  await page.waitForTimeout(CORRELATION_WINDOW_MS);
  detach();

  return { actionId, action: actionLabel, timestamp: startTime, networkEvents, consoleEvents };
};
