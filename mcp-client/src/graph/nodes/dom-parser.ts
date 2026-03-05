/**
 * DOM tree parser — extracts interactive elements from browser DOM snapshots.
 */

const MAX_INTERACTIVE_ELEMENTS = 20;
const MAX_ELEMENT_TEXT_LENGTH = 50;

type DomElement = { tag?: string; text?: string; href?: string; type?: string; id?: string; children?: DomElement[] };

export const extractInteractiveElements = (elements: unknown[]): string[] => {
  const results: string[] = [];

  const walk = (nodes: unknown[]): void => {
    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) continue;
      const el = node as DomElement;
      const tag = el.tag?.toLowerCase() ?? '';
      const text = (el.text ?? '').trim().slice(0, MAX_ELEMENT_TEXT_LENGTH);
      const href = el.href ?? '';
      const id = el.id ?? '';

      if (tag === 'a' && href) results.push(`link:${href}${text ? ` "${text}"` : ''}`);
      else if (tag === 'button') results.push(`button:${text || id || 'unnamed'}`);
      else if (tag === 'input' && el.type !== 'hidden') results.push(`input[${el.type ?? 'text'}]:${id || text}`);
      else if (tag === 'form') results.push(`form:${id || 'unnamed'}`);

      if (Array.isArray(el.children)) walk(el.children);
    }
  };

  walk(elements);
  return results.slice(0, MAX_INTERACTIVE_ELEMENTS);
};
