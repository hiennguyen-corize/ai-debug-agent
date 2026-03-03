/**
 * Constants barrel re-export.
 */

export {
  DEFAULT_TIMEOUT_MS,
  CLICK_TIMEOUT_MS,
  FILL_TIMEOUT_MS,
  INNER_TEXT_TIMEOUT_MS,
  NAVIGATION_TIMEOUT_MS,
  DEFAULT_SPA_WAIT_MS,
  SPA_SETTLE_DELAY_MS,
  FILL_SPA_WAIT_MS,
  NAVIGATE_SPA_WAIT_MS,
} from './constants/browser.js';

export {
  DEFAULT_MAX_ELEMENTS,
  ELEMENT_TEXT_MAX_LENGTH,
  HTTP_ERROR_MIN_STATUS,
} from './constants/dom.js';

export {
  STABILITY_ID,
  STABILITY_TEST_ID,
  STABILITY_ARIA_LABEL,
  STABILITY_NAME,
  STABILITY_ROLE,
  STABILITY_TYPE,
  STABILITY_TAG_CLASS,
  STABILITY_CLASS,
  STABILITY_TAG,
  STABILITY_FALLBACK,
  STABILITY_NTH_CHILD,
} from './constants/stability.js';

export {
  CORRELATION_WINDOW_MS,
  CONSOLE_LOG_TYPE,
  isConsoleLogType,
} from './constants/collector.js';

export type { ConsoleLogType } from './constants/collector.js';

export {
  PAYMENT_PATTERN,
  DELETE_PATTERN,
  LOGOUT_PATTERN,
  ACCOUNT_PATTERN,
} from './constants/guardrails.js';

export {
  ID_SELECTOR_PATTERN,
  TAG_CLASS_SELECTOR_PATTERN,
  TAG_ONLY_SELECTOR_PATTERN,
} from './constants/selectors.js';
