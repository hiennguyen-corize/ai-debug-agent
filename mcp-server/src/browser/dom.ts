/**
 * DOM extraction — extracts interactive elements from page.
 */

import type { Page, ElementHandle } from 'playwright';
import type { DomElement, DomSnapshot } from '../types/index.js';
import { DEFAULT_MAX_ELEMENTS, ELEMENT_TEXT_MAX_LENGTH } from '../constants.js';
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

const extractElement = async (
  handle: ElementHandle,
  page: Page,
): Promise<DomElement | null> => {
  try {
    const isVisible = await handle.isVisible();
    const rawText = await handle.innerText().catch(() => '');
    const text = rawText.trim().slice(0, ELEMENT_TEXT_MAX_LENGTH);
    const selectorCandidate = await findBestSelector(handle, page);

    const attrs = await handle.evaluate((el) => {
      const result: Record<string, string> = {};
      result['tag'] = el.tagName.toLowerCase();
      for (const attr of ['type', 'href', 'placeholder', 'value', 'disabled', 'checked']) {
        const val = el.getAttribute(attr);
        if (val !== null) result[attr] = val;
      }
      return result;
    });

    const tag = attrs['tag'] ?? 'unknown';
    const role = await handle.getAttribute('role');

    return {
      tag,
      selector: selectorCandidate.selector,
      stabilityScore: selectorCandidate.score,
      text,
      attributes: attrs,
      isVisible,
      isInteractive: INTERACTIVE_TAGS.has(tag) || (role !== null && INTERACTIVE_ROLES.has(role)),
    };
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
