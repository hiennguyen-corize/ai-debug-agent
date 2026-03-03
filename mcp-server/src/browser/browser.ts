/**
 * Playwright browser lifecycle management.
 * Context isolation per investigation session.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { BrowserConfig } from '../types/index.js';
import { DEFAULT_TIMEOUT_MS } from '../constants.js';

let browser: Browser | null = null;
const contexts = new Map<string, BrowserContext>();
const pages = new Map<string, Page>();

const DEFAULT_CONFIG: BrowserConfig = {
  headless: true,
  defaultTimeout: DEFAULT_TIMEOUT_MS,
};

export const ensureBrowser = async (config?: Partial<BrowserConfig>): Promise<Browser> => {
  if (browser !== null) return browser;
  const merged = { ...DEFAULT_CONFIG, ...config };
  browser = await chromium.launch({ headless: merged.headless });
  return browser;
};

export const createSession = async (
  sessionId: string,
  config?: Partial<BrowserConfig>,
): Promise<Page> => {
  const b = await ensureBrowser(config);
  const merged = { ...DEFAULT_CONFIG, ...config };

  const context = await b.newContext({
    ignoreHTTPSErrors: true,
    javaScriptEnabled: true,
  });
  context.setDefaultTimeout(merged.defaultTimeout);

  const page = await context.newPage();
  contexts.set(sessionId, context);
  pages.set(sessionId, page);
  return page;
};

export const getPage = (sessionId: string): Page => {
  const page = pages.get(sessionId);
  if (page === undefined) {
    throw new Error(`No page for session "${sessionId}". Call createSession() first.`);
  }
  return page;
};

export const getContext = (sessionId: string): BrowserContext => {
  const context = contexts.get(sessionId);
  if (context === undefined) {
    throw new Error(`No context for session "${sessionId}". Call createSession() first.`);
  }
  return context;
};

export const closeSession = async (sessionId: string): Promise<void> => {
  const context = contexts.get(sessionId);
  if (context !== undefined) {
    await context.close();
    contexts.delete(sessionId);
    pages.delete(sessionId);
  }
};

export const shutdown = async (): Promise<void> => {
  for (const [id] of contexts) {
    await closeSession(id);
  }
  if (browser !== null) {
    await browser.close();
    browser = null;
  }
};
