/**
 * Selector stability scoring.
 * Contains Playwright evaluate callbacks — eslint can't resolve DOM types.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

import type { Page, ElementHandle } from 'playwright';
import type { SelectorCandidate } from '#types/index.js';
import {
  STABILITY_ID,
  STABILITY_TEST_ID,
  STABILITY_ARIA_LABEL,
  STABILITY_NAME,
  STABILITY_ROLE,
  STABILITY_TAG_CLASS,
  STABILITY_TAG,
  STABILITY_NTH_CHILD,
  STABILITY_FALLBACK,
} from '#constants.js';
import {
  ID_SELECTOR_PATTERN,
  TAG_CLASS_SELECTOR_PATTERN,
  TAG_ONLY_SELECTOR_PATTERN,
} from '#constants/selectors.js';

type ElementAttributes = {
  id: string;
  testId: string | null;
  ariaLabel: string | null;
  name: string | null;
  tag: string;
  className: string;
};

export const computeStabilityScore = (selector: string): number => {
  if (ID_SELECTOR_PATTERN.test(selector)) return STABILITY_ID;
  if (selector.includes('[data-testid=')) return STABILITY_TEST_ID;
  if (selector.includes('[aria-label=')) return STABILITY_ARIA_LABEL;
  if (selector.includes('[name=')) return STABILITY_NAME;
  if (selector.includes('[role=')) return STABILITY_ROLE;
  if (TAG_CLASS_SELECTOR_PATTERN.test(selector)) return STABILITY_TAG_CLASS;
  if (TAG_ONLY_SELECTOR_PATTERN.test(selector)) return STABILITY_TAG;
  if (selector.includes('nth-child') || selector.includes('nth-of-type')) return STABILITY_NTH_CHILD;
  return STABILITY_FALLBACK;
};

const addAttrCandidates = (attrs: ElementAttributes, candidates: SelectorCandidate[]): void => {
  if (attrs.id !== '') candidates.push({ selector: `#${attrs.id}`, score: STABILITY_ID });
  if (attrs.testId !== null) candidates.push({ selector: `[data-testid="${attrs.testId}"]`, score: STABILITY_TEST_ID });
  if (attrs.ariaLabel !== null) candidates.push({ selector: `${attrs.tag}[aria-label="${attrs.ariaLabel}"]`, score: STABILITY_ARIA_LABEL });
  if (attrs.name !== null) candidates.push({ selector: `${attrs.tag}[name="${attrs.name}"]`, score: STABILITY_NAME });
};

const addClassCandidate = (attrs: ElementAttributes, candidates: SelectorCandidate[]): void => {
  if (typeof attrs.className === 'string' && attrs.className.trim() !== '') {
    const firstClass = attrs.className.trim().split(/\s+/)[0];
    if (firstClass !== undefined) candidates.push({ selector: `${attrs.tag}.${firstClass}`, score: STABILITY_TAG_CLASS });
  }
};

const buildCandidates = (attrs: ElementAttributes): SelectorCandidate[] => {
  const candidates: SelectorCandidate[] = [];
  addAttrCandidates(attrs, candidates);
  addClassCandidate(attrs, candidates);
  candidates.push({ selector: attrs.tag, score: STABILITY_TAG });
  return candidates;
};

const extractAttributes = async (element: ElementHandle): Promise<ElementAttributes> =>
  element.evaluate((el): ElementAttributes => ({
    id: el.id,
    testId: el.getAttribute('data-testid'),
    ariaLabel: el.getAttribute('aria-label'),
    name: el.getAttribute('name'),
    tag: el.tagName.toLowerCase(),
    className: String(el.className),
  }));

const findUniqueCandidate = async (
  candidates: SelectorCandidate[],
  page: Page,
): Promise<SelectorCandidate | null> => {
  for (const candidate of candidates) {
    try {
      const count = await page.locator(candidate.selector).count();
      if (count === 1) return candidate;
    } catch { /* invalid selector */ }
  }
  return null;
};

export const findBestSelector = async (
  element: ElementHandle,
  page: Page,
): Promise<SelectorCandidate> => {
  const attrs = await extractAttributes(element);
  const candidates = buildCandidates(attrs);
  const unique = await findUniqueCandidate(candidates, page);
  return unique ?? candidates[0] ?? { selector: attrs.tag, score: STABILITY_FALLBACK };
};
