/**
 * Graph constants — thresholds, messages, and patterns.
 */

// ── Iteration thresholds ─────────────────────────────────────────────────
export const MAX_NO_TOOL_RETRIES = 3;
export const MAX_STALL_COUNT = 5;
export const MAX_SAME_SIG_FAILURES = 3;
export const MAX_REASONING_REPROMPT_ITERATION = 5;
export const GRAPH_RECURSION_LIMIT = 200;

// ── Context window sliding ───────────────────────────────────────────────
export const SLIDING_WINDOW_SIZE = 6;
export const HIGH_USAGE_PCT = 75;
export const MED_USAGE_PCT = 50;
export const HIGH_USAGE_WINDOW = 3;
export const MED_USAGE_WINDOW = 4;

// ── Circular detection ───────────────────────────────────────────────────
export const CIRCULAR_DETECTION_WINDOW = 20;
export const MIN_ACTIONS_FOR_PATTERN = 8;
export const MIN_PATTERN_LEN = 2;
export const MAX_PATTERN_LEN = 5;
export const CIRCULAR_RATIO_THRESHOLD = 0.25;
export const CIRCULAR_COOLDOWN = 5;

// ── Context compression ──────────────────────────────────────────────────
export const MAX_NETWORK_LINES = 5;
export const MAX_CONSOLE_LINES = 3;
export const MAX_CONTENT_LEN = 500;
export const TRUNCATE_PREVIEW_LEN = 200;
export const MIN_COMPRESS_LENGTH = 100;
export const MAX_FAILED_DISPLAY = 5;

// ── Tool dispatch ────────────────────────────────────────────────────────
export const RETRY_DELAY_MS = 1000;
export const EVENT_RESULT_PREVIEW_LEN = 2000;

// ── Prompt messages ──────────────────────────────────────────────────────
export const FORCE_FINISH_MESSAGE = `You are running out of context budget. You MUST call finish_investigation NOW with whatever evidence you have. A partial report is better than no report.`;
export const STALL_FINISH_MESSAGE = `Your investigation is STALLED — all recent tool calls failed. Call finish_investigation immediately with whatever evidence you have gathered so far.`;
export const CRASHED_PAGE_GUIDANCE = `The page appears crashed or empty. Do NOT keep retrying — call finish_investigation with what you found before the crash.`;
export const NO_TOOL_RETRY_MESSAGE = `You must call at least one tool. Use browser_snapshot to observe the page, or call finish_investigation if you have enough evidence.`;

// ── Budget-aware checkpoints ─────────────────────────────────────────────
export const CHECKPOINT_INTERVAL = 10;
export const STALL_WARNING_THRESHOLD = 3;

// ── Error recovery ───────────────────────────────────────────────────────
export const RECOVERABLE_PATTERNS = [
  { pattern: /timeout/i, strategy: 'retry' as const },
  { pattern: /navigation/i, strategy: 'retry' as const },
  { pattern: /target closed|page crashed|page has been closed/i, strategy: 'navigate_back' as const },
];

export const ERROR_PATTERN = /(?:TypeError|ReferenceError|SyntaxError|RangeError|Error|Uncaught)[\s:].{5,200}/gi;
