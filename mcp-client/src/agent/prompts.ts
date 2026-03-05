/**
 * System prompts and message builders per agent role.
 */

import type { ScoutObservation } from '@ai-debug/shared';
import { EVIDENCE_TYPE } from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { SkillRegistry } from '#agent/skill-registry.js';
import type OpenAI from 'openai';

// --- Scout ---

export const SCOUT_SYSTEM_PROMPT = `You are Scout — your mission is to observe and collect initial information.

TASKS:
1. Navigate to the provided URL
2. Observe everything that happens: console errors, network requests, DOM state
3. If a hint is provided, perform basic actions related to that hint
4. Collect bundle URLs from network requests (.js files)
5. Note any anomalies (spinners stuck, empty states, console errors)

DO NOT:
- Analyze root causes
- Draw conclusions
- Perform complex interactions

OUTPUT: Return a structured ScoutObservation with all collected data.` as const;

// --- Planner ---

export const PLANNER_SYSTEM_PROMPT = `You are Planner — the strategic brain in a bug investigation.

You have TWO modes of operation:

## MODE 1: Write Investigation Brief (default)
When you need the browser Executor to investigate something, respond with a NATURAL LANGUAGE investigation brief. Include:
- What to investigate and why
- Suggested approach (executor can adapt)
- What evidence to collect (console errors, screenshots, comparisons)
- When to stop

## MODE 2: Direct Analysis (use function calling)
When evidence contains stack traces with file:line:col → use source-map tools directly.
When you have enough evidence → call finish_investigation.

## DECISION FLOW
1. First call (after Scout): Write brief based on hint + scout observations
2. After Executor returns: Evaluate results
   - Got console errors with stack traces? → Use source-map tools
   - Got clear evidence of the bug? → Call finish_investigation
   - Need more evidence? → Write another brief (different approach)

## CRITICAL RULES
- NEVER write more than 3 briefs total — after 2 executor rounds, call finish_investigation
- Be SPECIFIC in briefs — include URLs, product names, exact steps
- DO NOT repeat the same investigation approach
- If executor found console errors, analyze them before dispatching again

## LANGUAGE RULE
ALWAYS reason in English internally.
Write your brief in the SAME language as the user's hint.` as const;

export const PLANNER_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_source_map',
      description: 'Fetch and parse a JavaScript source map from a bundle URL',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL of the JS bundle' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_error_location',
      description: 'Map a minified line:column to original source using a fetched source map',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL of the JS bundle' },
          line: { type: 'number', description: 'Line number in minified code' },
          column: { type: 'number', description: 'Column number in minified code' },
        },
        required: ['url', 'line', 'column'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_source_file',
      description: 'Read original source code from a source map',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL of the JS bundle' },
          filePath: { type: 'string', description: 'Path to the original source file' },
          startLine: { type: 'number' },
          endLine: { type: 'number' },
        },
        required: ['url', 'filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish_investigation',
      description: 'Signal that investigation is complete and ready for synthesis',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of findings' },
        },
        required: ['summary'],
      },
    },
  },
];

// --- Executor ---

export const EXECUTOR_SYSTEM_PROMPT = `You are Executor — an autonomous browser debugging agent.

You have been given an investigation brief by the Planner. Use browser tools to investigate the bug.

## KEY PRINCIPLES
1. You have FULL AUTONOMY — follow the brief's approach but adapt when things go wrong
2. You have the user's ORIGINAL HINT — use it directly
3. Check console errors FREQUENTLY (browser_console_messages) — they are the #1 evidence source
4. Take screenshots of important findings (browser_take_screenshot)

## ReAct PATTERN
Each turn:
1. THINK: What do I know? What should I do next?
2. ACT: Call browser tools
3. OBSERVE: Check results before next action

## SYSTEMATIC TESTING
When testing different inputs/categories:
1. Test FAILING case first (from hint)
2. Then test WORKING case for comparison
3. Report BOTH results

## STOP CONDITIONS
- Console error found → collect error text + screenshot → respond with findings
- Page crashes/blank → screenshot → respond
- After 8+ actions with no new evidence → respond with what you found

## CRITICAL
- Use ONLY the provided browser tools. Do NOT invent tool names.
- When you're done, respond with a TEXT message summarizing your raw findings.
  Do NOT analyze or explain — just report what you observed.
- ALWAYS check browser_console_messages after page loads and after interactions.

## IMPORTANT: Element Selection
Use accessibility refs from browser_snapshot to interact with elements.
Example: After browser_snapshot shows 'button "Add to Cart" [ref=e45]',
call browser_click with element="Add to Cart" and ref="e45".` as const;

// --- Synthesis ---

export const SYNTHESIS_SYSTEM_PROMPT = `You are Synthesis — produce the final investigation report.

OUTPUT: Use these EXACT markdown headers in your response:

## Root Cause
Precise, technical root cause based ONLY on observed evidence.

## Reproduction Steps
Numbered list of exact steps from evidence (what Executor actually did).

## Confidence
State: HIGH (source code seen), MEDIUM (error + context), or LOW (inference only).

## Severity
One of: critical, high, medium, low.

## Assumptions
List any assumptions made during investigation.

## Suggested Fix
Before/after code ONLY if source code was read. Otherwise suggest general defensive approach.

## VISUAL ANALYSIS (when screenshots provided)
If screenshots are attached, analyze visual state.

## ANTI-HALLUCINATION RULES (MANDATORY)
- Use EXACT error messages from console logs — copy verbatim
- NEVER fabricate file names, variable names, function names, or line numbers
- ONLY reference code constructs that appear in the evidence
- Distinguish between OBSERVED facts and INFERRED conclusions

LANGUAGE RULE: Write the FINAL report in the SAME language as the user's hint/input.
Code identifiers and technical terms stay in English.

Be concise, technical, and actionable.` as const;

// --- Message Builders ---

const buildScoutSummary = (obs: ScoutObservation | null): string => {
  if (obs === null) return 'No scout data available';
  return [
    `Page title: "${obs.pageTitle}"`,
    `Console errors: ${obs.consoleErrors.length.toString()}`,
    obs.consoleErrors.length > 0 ? `Errors:\n${obs.consoleErrors.slice(0, 5).join('\n')}` : '',
    `DOM snapshot (first 500 chars):\n${obs.domSnapshot.slice(0, 500)}`,
  ].filter(Boolean).join('\n');
};

export const buildPlannerMessages = (
  state: AgentState,
  skillRegistry?: SkillRegistry,
): OpenAI.Chat.ChatCompletionMessageParam[] => {
  let systemPrompt: string = PLANNER_SYSTEM_PROMPT;
  if (skillRegistry !== undefined && state.activeSkills.length > 0) {
    const skillContext = skillRegistry.buildPromptContext(state.activeSkills);
    systemPrompt = `${PLANNER_SYSTEM_PROMPT}\n\n# Active Skills\n\n${skillContext}`;
  }

  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Scout observations
  if (state.initialObservations !== null) {
    msgs.push({ role: 'user', content: `SCOUT OBSERVATIONS:\n${buildScoutSummary(state.initialObservations)}` });
  }

  // User hint — passed directly, no interpretation
  if (state.hint !== null) {
    msgs.push({ role: 'user', content: `USER HINT: ${state.hint}` });
  }

  // URL
  msgs.push({ role: 'user', content: `TARGET URL: ${state.url}` });

  // Previous executor results (for rounds 2+)
  if (state.executorResults.length > 0) {
    msgs.push({
      role: 'user',
      content: `EXECUTOR RESULTS FROM PREVIOUS ROUND:\n${state.executorResults.join('\n---\n').slice(0, 4000)}`,
    });
  }

  // Previous evidence
  const toolEvidence = state.evidence
    .filter((e) => e.type === EVIDENCE_TYPE.SOURCE_CODE && typeof e.data === 'string')
    .slice(-3);
  if (toolEvidence.length > 0) {
    msgs.push({
      role: 'user',
      content: `PREVIOUS EVIDENCE:\n${toolEvidence.map((e) => e.data).join('\n---\n')}`,
    });
  }

  msgs.push({ role: 'user', content: `This is planner round ${(state.plannerRound + 1).toString()}/3. ${state.plannerRound >= 2 ? 'LAST ROUND — you MUST call finish_investigation.' : ''}` });

  return msgs;
};

export const buildExecutorMessages = (
  state: AgentState,
  _tools: OpenAI.Chat.ChatCompletionTool[],
): OpenAI.Chat.ChatCompletionMessageParam[] => {
  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: EXECUTOR_SYSTEM_PROMPT },
  ];

  // Self-contained prompt: everything the executor needs
  const parts: string[] = [];

  // 1. Investigation brief from Planner
  if (state.investigationBrief !== null) {
    parts.push(`INVESTIGATION BRIEF:\n${state.investigationBrief}`);
  }

  // 2. Original hint — NO interpretation loss
  if (state.hint !== null) {
    parts.push(`ORIGINAL USER HINT: ${state.hint}`);
  }

  // 3. Target URL
  parts.push(`TARGET URL: ${state.url}`);

  // 4. Scout observations
  if (state.initialObservations !== null) {
    parts.push(`SCOUT DATA:\n${buildScoutSummary(state.initialObservations)}`);
  }

  // 5. Previous evidence (from prior rounds)
  if (state.executorResults.length > 0) {
    parts.push(`PREVIOUS FINDINGS:\n${state.executorResults.slice(-5).join('\n').slice(0, 2000)}`);
  }

  msgs.push({ role: 'user', content: parts.join('\n\n') });

  return msgs;
};
