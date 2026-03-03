/**
 * DOM extraction types.
 */

export type DomElement = {
  tag: string;
  selector: string;
  stabilityScore: number;
  text: string;
  attributes: Record<string, string>;
  isVisible: boolean;
  isInteractive: boolean;
};

export type DomSnapshot = {
  title: string;
  url: string;
  elements: DomElement[];
  totalElements: number;
  truncated: boolean;
};

export type SelectorCandidate = {
  selector: string;
  score: number;
};
