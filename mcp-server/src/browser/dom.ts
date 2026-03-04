/**
 * DOM extraction — extracts interactive elements from page.
 * Contains Playwright evaluate callbacks — eslint can't resolve DOM types.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

import type { Page, ElementHandle } from 'playwright';
import type { DomElement, DomSnapshot, SelectorCandidate } from '#types/index.js';
import { DEFAULT_MAX_ELEMENTS, ELEMENT_TEXT_MAX_LENGTH } from '#constants.js';
import { findBestSelector } from './stability.js';

const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
]);

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'tab', 'menuitem', 'checkbox', 'radio',
  'switch', 'textbox', 'combobox', 'listbox', 'option',
]);

const INTERACTIVE_SELECTOR = [
  ...INTERACTIVE_TAGS, '[role]', '[onclick]', '[data-testid]', '[contenteditable]',
].join(', ');

const ATTRS_TO_EXTRACT = ['type', 'href', 'placeholder', 'value', 'disabled', 'checked'] as const;

const evaluateAttributes = async (handle: ElementHandle): Promise<Record<string, string>> =>
  handle.evaluate((el, attrs) => {
    const result: Record<string, string> = { tag: el.tagName.toLowerCase() };
    for (const attr of attrs) {
      const val = el.getAttribute(attr);
      if (val !== null) result[attr] = val;
    }
    return result;
  }, [...ATTRS_TO_EXTRACT]);

const toDomElement = (
  handle: { isVisible: boolean; text: string; role: string | null },
  attrs: Record<string, string>,
  selector: SelectorCandidate,
): DomElement => {
  const tag = attrs['tag'] ?? 'unknown';
  return {
    tag,
    selector: selector.selector,
    stabilityScore: selector.score,
    text: handle.text,
    attributes: attrs,
    isVisible: handle.isVisible,
    isInteractive: INTERACTIVE_TAGS.has(tag) || (handle.role !== null && INTERACTIVE_ROLES.has(handle.role)),
  };
};

const extractElement = async (
  handle: ElementHandle,
  page: Page,
): Promise<DomElement | null> => {
  try {
    const isVisible = await handle.isVisible();
    const text = (await handle.innerText().catch(() => '')).trim().slice(0, ELEMENT_TEXT_MAX_LENGTH);
    const role = await handle.getAttribute('role');
    const attrs = await evaluateAttributes(handle);
    const selector = await findBestSelector(handle, page);
    return toDomElement({ isVisible, text, role }, attrs, selector);
  } catch {
    return null;
  }
};

const extractElements = async (
  handles: ElementHandle[],
  page: Page,
  maxElements: number,
): Promise<DomElement[]> => {
  const results = await Promise.all(
    handles.slice(0, maxElements).map((h) => extractElement(h, page)),
  );
  return results.filter((el): el is DomElement => el !== null);
};

export const extractDOM = async (
  page: Page,
  maxElements: number = DEFAULT_MAX_ELEMENTS,
): Promise<DomSnapshot> => {
  const title = await page.title();
  const url = page.url();
  const handles = await page.$$(INTERACTIVE_SELECTOR);
  const elements = await extractElements(handles, page, maxElements);

  return {
    title,
    url,
    elements,
    totalElements: handles.length,
    truncated: handles.length > maxElements,
  };
};
