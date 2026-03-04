/**
 * Browser action wrappers.
 */

import type { Page } from 'playwright';
import type { ActionResult, GuardrailConfig } from '#types/index.js';
import {
  CLICK_TIMEOUT_MS,
  FILL_TIMEOUT_MS,
  FILL_SPA_WAIT_MS,
  DEFAULT_SPA_WAIT_MS,
  DEFAULT_WAIT_TIMEOUT_MS,
  DEFAULT_SCROLL_PIXELS,
  NAVIGATE_SPA_WAIT_MS,
  SPA_SETTLE_DELAY_MS,
  NAVIGATION_TIMEOUT_MS,
  INNER_TEXT_TIMEOUT_MS,
} from '#constants.js';
import { checkGuardrails } from './guardrails.js';

const waitForSPA = async (page: Page, waitMs: number): Promise<void> => {
  try {
    await page.waitForLoadState('networkidle', { timeout: waitMs });
  } catch { /* networkidle timeout — proceed */ }
  await page.waitForTimeout(Math.min(waitMs, SPA_SETTLE_DELAY_MS));
};

const failResult = (err: unknown): ActionResult => ({
  success: false,
  error: err instanceof Error ? err.message : String(err),
});

const getElementText = async (page: Page, selector: string): Promise<string> => {
  try {
    return await page.locator(selector).first().innerText({ timeout: INNER_TEXT_TIMEOUT_MS });
  } catch { return ''; }
};

export const navigateTo = async (
  page: Page,
  url: string,
  spaWaitMs: number = NAVIGATE_SPA_WAIT_MS,
): Promise<ActionResult> => {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    await waitForSPA(page, spaWaitMs);
    return { success: true };
  } catch (err) {
    return failResult(err);
  }
};

export const clickElement = async (
  page: Page,
  selector: string,
  spaWaitMs: number = DEFAULT_SPA_WAIT_MS,
  guardrailConfig?: Partial<GuardrailConfig>,
): Promise<ActionResult> => {
  const elementText = await getElementText(page, selector);
  const check = checkGuardrails(`click ${selector} "${elementText}"`, guardrailConfig);
  if (!check.allowed) {
    return { success: false, error: check.reason ?? 'Blocked by guardrail', blockedByGuardrail: true };
  }

  try {
    await page.locator(selector).first().click({ timeout: CLICK_TIMEOUT_MS });
    await waitForSPA(page, spaWaitMs);
    return { success: true };
  } catch (err) {
    return failResult(err);
  }
};

export const fillInput = async (
  page: Page,
  selector: string,
  value: string,
  spaWaitMs: number = FILL_SPA_WAIT_MS,
): Promise<ActionResult> => {
  try {
    await page.locator(selector).first().fill(value, { timeout: FILL_TIMEOUT_MS });
    await waitForSPA(page, spaWaitMs);
    return { success: true };
  } catch (err) {
    return failResult(err);
  }
};

export const selectOption = async (
  page: Page,
  selector: string,
  value: string,
): Promise<ActionResult> => {
  try {
    await page.locator(selector).first().selectOption(value, { timeout: CLICK_TIMEOUT_MS });
    return { success: true };
  } catch (err) {
    return failResult(err);
  }
};

export const hoverElement = async (
  page: Page,
  selector: string,
): Promise<ActionResult> => {
  try {
    await page.locator(selector).first().hover({ timeout: CLICK_TIMEOUT_MS });
    return { success: true };
  } catch (err) {
    return failResult(err);
  }
};

export const waitForCondition = async (
  page: Page,
  selector?: string,
  timeoutMs?: number,
): Promise<ActionResult> => {
  const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  try {
    if (selector !== undefined) {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout });
    } else {
      await page.waitForTimeout(timeout);
    }
    return { success: true };
  } catch (err) {
    return failResult(err);
  }
};

export const scrollPage = async (
  page: Page,
  direction: 'up' | 'down' = 'down',
  pixels: number = DEFAULT_SCROLL_PIXELS,
): Promise<ActionResult> => {
  try {
    const delta = direction === 'down' ? pixels : -pixels;
    await page.mouse.wheel(0, delta);
    await waitForSPA(page, SPA_SETTLE_DELAY_MS);
    return { success: true };
  } catch (err) {
    return failResult(err);
  }
};

export const uploadFile = async (
  page: Page,
  selector: string,
  filePath: string,
): Promise<ActionResult> => {
  try {
    await page.locator(selector).first().setInputFiles(filePath);
    return { success: true };
  } catch (err) {
    return failResult(err);
  }
};
