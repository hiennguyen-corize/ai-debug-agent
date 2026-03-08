# AI Debug Agent — Architecture v7.2

> **Single Agent Loop architecture.** One LLM agent controls a real browser via Playwright MCP, investigates bugs autonomously, and produces structured reports.

---

## 1. Overview

### 1.1 Problem

Developer gặp bug → mở browser → thao tác → đọc console → đọc network → tìm source map → trace flow → đoán nguyên nhân. Mất 30–60 phút.

**AI Debug Agent** thay thế toàn bộ. Input: URL + hint → Output: structured report.

### 1.2 Design Philosophy

- **Single agent loop** — one LLM, one browser, one conversation
- **Budget-aware** — continuous `[Context: X/Y tokens (Z%)]` on every LLM call, force finish as safety net
- **Evidence-driven** — agent chooses investigation strategy based on observed evidence, not fixed steps
- **OBSERVE → PLAN** — agent synthesizes last result + updates hypothesis before planning next tool call

### 1.3 Investigation Modes

|                  | `interactive` (default)             | `autonomous` |
| ---------------- | ----------------------------------- | ------------ |
| Khi cần guidance | `ask_user` tool (uncertainty-based) | Tự assume    |
| Phù hợp          | Debug session tương tác             | CI/CD, batch |

---

## 2. Monorepo Structure

```
ai-debug-agent/
├── shared/              # Types, schemas, constants — zero runtime deps
│   ├── agent.ts         # AgentEvent, InvestigationStep, INVESTIGATION_PHASE, ARTIFACT_TYPE
│   ├── domain.ts        # InvestigationReport, CodeLocation, Evidence, modes
│   ├── browser.ts       # CapturedLog, CapturedRequest, CorrelatedEvidence
│   ├── schemas.ts       # Zod: InvestigationRequestSchema (input validation)
│   └── types.ts         # Barrel re-export
├── engine/              # Core: agent graph, LLM, Playwright bridge, source maps
│   ├── agent/           # LangGraph graph, tool definitions, prompts, bridges, config
│   │   ├── graph/       # LangGraph orchestration: nodes, state, dispatch, helpers
│   │   ├── loop/        # Tool definitions, normalize, prompts, snapshot-summarizer
│   │   └── tools/       # Custom tool implementations (fetch-js-snippet, sourcemap-tools)
│   ├── sourcemap/       # Source map consumer, fetcher, resolver, tracer
│   ├── observability/   # EventBus, InvestigationLogger, StepAggregator
│   ├── reporter/        # Markdown report generator
│   └── service/         # InvestigationService (pipeline orchestrator)
├── api/                 # Hono REST API + SQLite + SSE streaming
│   ├── routes/          # investigate.ts, reports.ts
│   ├── services/        # ThreadService (business logic)
│   ├── repositories/    # ThreadRepository, ArtifactRepository (Drizzle ORM data access)
│   ├── middleware/      # auth, error-handler, request-logger
│   ├── db/              # schema.ts, client.ts (SQLite + Drizzle)
│   └── lib/             # logger.ts, response.ts, dtos.ts
├── web/                 # Vite + React dashboard
│   ├── stores/          # Zustand: investigation-store, settings-store
│   ├── api/             # HTTP client (ky), SSE, type mirrors
│   ├── design-system/   # tokens.css, globals.css, animations.css
│   ├── lib/             # utils.ts
│   └── components/      # Composites, features, primitives
├── tests/               # Unit + integration tests (Vitest)
└── ai-debug.config.json # Runtime configuration
```

**Dependencies:**

```
shared ← engine ← api
         web (standalone, mirrors shared types via api/types.ts)
```

---

## 3. System Diagram

```
┌─────────────────────────────────────────────────┐
│                    Consumers                     │
│    Web Dashboard    │       REST API             │
└─────────┬───────────┼──────────────┬─────────────┘
          │           │              │
    ┌─────▼──────┐    │       ┌──────▼──────┐
    │    web/    │    │       │    api/     │
    │  (Vite)   │    │       │  (Hono)    │
    └───────────┘    │       └──────┬──────┘
                     │              │
           ┌─────────▼──────────────▼──────────────┐
           │              engine/                   │
           │                                        │
           │  ┌──────────────────────────────────┐  │
           │  │    LangGraph Investigation       │  │
           │  │                                  │  │
           │  │  Agent ──► Tool Dispatch ──► ─┐  │  │
           │  │   ▲                           │  │  │
           │  │   └── Tool Results ◄──────────┘  │  │
           │  │                                  │  │
           │  │  Token-based budget awareness    │  │
           │  │  Force finish at last iteration   │  │
           │  └──┬──────────────┬──────────────┬─┘  │
           │     │              │              │     │
           │  Playwright    Source Map    fetch_js   │
           │  MCP Tools    (direct)     _snippet    │
           └─────┼──────────────┼──────────────┼────┘
                 │              │              │
           ┌─────▼──────┐ ┌────▼─────┐  ┌─────▼─────┐
           │ @playwright │ │ engine/  │  │ HTTP fetch│
           │    /mcp     │ │sourcemap │  │ (JS file) │
           │ (Chromium)  │ │(direct)  │  └───────────┘
           └─────────────┘ └──────────┘
```

---

## 4. Agent Loop

### 4.1 Flow

```
INPUT: URL + hint
         │
         ▼
  System Prompt + User Message
         │
         ▼
  ┌──────────────────────────────────┐
  │     LangGraph StateGraph         │
  │                                  │
  │  START → agent → shouldContinue? │
  │   ├── tools → after_tools ──┐    │
  │   │    ├── agent (loop)     │    │
  │   │    ├── force_finish ────┘    │
  │   │    └── end → END            │
  │   ├── no_tools → agent (retry)  │
  │   ├── emergency → END           │
  │   └── end → END                 │
  └──────────────────────────────────┘
         │
         ▼
  FinishResult → buildReport() → InvestigationReport
```

### 4.2 Key Files

| File                           | Role                                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graph/nodes.ts`               | Node functions: `createAgentNode`, `createToolNode`, `afterToolsNode`, `forceFinishNode`, `emergencyNode`, `handleReasoningReprompt`. Conditional edges: `shouldContinue`, `shouldContinueAfterTools` |
| `graph/helpers.ts`             | Config access, serialization, action tracking (`extractSig`, `detectCircularPattern`), context compression (`trimOldToolResults`), budget injection (`injectBudgetMessage`)                           |
| `graph/tool-dispatch.ts`       | Parallel tool execution with `Promise.allSettled`, prior-fail guards, artifact emission                                                                                                               |
| `graph/state.ts`               | LangGraph Annotation-based state, channel types, `InvestigationConfigurable` type                                                                                                                     |
| `graph/constants.ts`           | Thresholds, retry messages, budget intervals, recoverable patterns                                                                                                                                    |
| `graph/investigation-graph.ts` | LangGraph StateGraph builder: 6 nodes + conditional edges + `MemorySaver` checkpointer                                                                                                                |
| `graph/result-truncation.ts`   | Per-tool result size limits (snapshot: 4K, network: 3K, console/evaluate: 2K, default: 4K)                                                                                                            |
| `loop/tools.ts`                | Tool definitions: `FINISH_TOOL`, `SOURCE_MAP_TOOLS`, `ASK_USER_TOOL`, `FETCH_JS_SNIPPET_TOOL`                                                                                                         |
| `loop/normalize.ts`            | Parse LLM args → `FinishResult` (handles various shapes)                                                                                                                                              |
| `loop/prompts.ts`              | System prompt: OBSERVE→PLAN, STRATEGIES, BUDGET, EVIDENCE SUFFICIENCY, LANGUAGE, HYPOTHESIS_TRACKING, CAUSAL_REASONING, STATE_INSPECTION, EVENT_TIMELINE                                              |
| `loop/error-clustering.ts`     | Console error deduplication and clustering by signature                                                                                                                                               |
| `loop/snapshot-summarizer.ts`  | Compress Playwright YAML snapshots (50K→2-5K), summarize tool results, console error dedup                                                                                                            |
| `loop/types.ts`                | `FinishResult`, `SourceMapCall` type definitions                                                                                                                                                      |
| `llm-client.ts`                | LangChain ChatOpenAI wrapper for LangGraph                                                                                                                                                            |
| `config-loader.ts`             | 3-layer config: file → env → request → defaults                                                                                                                                                       |
| `playwright-bridge.ts`         | Playwright MCP client connection                                                                                                                                                                      |
| `message-queue.ts`             | User message queue for interactive mode                                                                                                                                                               |

### 4.3 Continuous Budget Awareness

Instead of periodic checkpoint injection, the agent receives **token-based** budget context on **every** LLM call:

```
[Context: 0/128,000 tokens (0%)]
[Context: 45,200/128,000 tokens (35%)] [Failed tools: browser_navigate:/path, resolve_error_location:bundle.js]
[Context: 112,000/128,000 tokens (88%)] [Failed tools: ...]
```

The system prompt teaches the agent to self-regulate:

- `> 60%` → wrap up, confirm strongest hypothesis
- `> 85%` → call `finish_investigation` with whatever evidence available
- Last iteration → FORCE_FINISH_MESSAGE (safety net)

Token-based is more accurate than iteration-based: one iteration with 5 parallel tools consumes ~5x more context than one iteration with 1 tool.

### 4.4 Agent Resilience Features

| Feature                       | Implementation                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Parallel tool execution**   | `Promise.allSettled` — executes multiple tool calls from a single LLM response                                                                   |
| **Episodic memory**           | `triedActions[]` tracks tool+args+success per iteration, prevents loops                                                                          |
| **Duplicate detection**       | Skip re-execution of tool+args that already failed, inject guidance message                                                                      |
| **Playwright error recovery** | `RECOVERABLE_PATTERNS` match timeout/navigation/page crash → auto-retry with 1s delay                                                            |
| **Proactive context mgmt**    | Dynamic sliding window: `SLIDING_WINDOW_SIZE=6` → `MED_USAGE_WINDOW=4` at 50% → `HIGH_USAGE_WINDOW=3` at 75%, type-aware compression             |
| **Token-based budget**        | `[Context: X/Y tokens (Z%)]` on every call — agent self-regulates                                                                                |
| **Stall detection**           | 3+ consecutive failed iterations → warning (`STALL_WARNING_THRESHOLD`); 5+ (`MAX_STALL_COUNT`) → force finish                                    |
| **Self-assessment**           | Agent checks "any untried strategy left?" after each OBSERVE → finishes if exhausted                                                             |
| **Force finish**              | Last iteration: mandatory `finish_investigation` with whatever evidence                                                                          |
| **Emergency finish**          | If agent exhausts budget without `finish_investigation` → `emergencyNode` synthesizes partial report from collected evidence. Never returns null |
| **Crash state detection**     | Empty page snapshot → inject guidance: "finish with evidence you have, do not re-navigate"                                                       |
| **Circular nav detection**    | `CIRCULAR_DETECTION_WINDOW=20` actions, pattern matching (len 2–5), `uniqueRatio < 0.35` → inject warning: "repeating same sequence, finish now" |
| **Per-sig failure counter**   | Consecutive failures for same action signature → auto-skip after 3 (`MAX_SAME_SIG_FAILURES`). Resets on success                                  |
| **Purposeful exploration**    | Prompt teaches: continue only if unanswered question + budget < 60% + different action                                                           |
| **No-tool retry**             | If LLM responds without tool calls → `no_tools` node injects retry message, up to `MAX_NO_TOOL_RETRIES=3`                                        |
| **Reasoning reprompt**        | If LLM omits OBSERVE→PLAN text in first 5 iterations (`MAX_REASONING_REPROMPT_ITERATION`) → re-prompt with guidance                              |
| **Result truncation**         | Per-tool output size limits before entering message history (snapshot: 4K, network: 3K, console/evaluate: 2K)                                    |

### 4.5 Tool Categories

**Playwright MCP (browser interaction):**
`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_select_option`, `browser_hover`, `browser_scroll`, `browser_console_messages`, `browser_network_requests`, `browser_evaluate`, `browser_wait_for`

**Source Map (code resolution):**
`fetch_source_map`, `resolve_error_location`

**Custom tools:**

- `finish_investigation` — submit bug report with findings + timeline + hypotheses
- `ask_user` — ask user questions (interactive mode, uncertainty-based)
- `fetch_js_snippet` — fetch minified JS and extract lines around error

**State inspection (via `browser_evaluate`):**
Framework detection (React/Vue/Redux) → read-only state extraction. Guardrails: no mutations, no side effects. System prompt includes `STATE_INSPECTION` section with framework-specific patterns.

### 4.6 Evidence-Driven Investigation

Agent chooses strategy based on observed evidence, not a hardcoded sequence:

```
FIRST STEP: navigate → snapshot → reproduce hint
       │
       ▼ (what do you see?)
       ┌───────────────────────────────────────────┐
       │  Console errors? → source maps → root cause │
       │  UI wrong?       → snapshot + state inspect  │
       │  Network issue?  → check responses/payloads  │
       │  Interaction bug? → reproduce + observe       │
       └───────────────────────────────────────────┘
       │
       ▼ (no progress after 2 attempts?)
       STRATEGY SWITCHING → try different approach
       │
       ▼
       finish_investigation
```

Key difference from fixed workflows: agent adapts to the bug type instead of following prescribed steps.

### 4.7 Loop Hardening

Multiple safety mechanisms prevent the agent from getting stuck or crashing silently:

| Mechanism                   | Description                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Error logging**           | Every exit path emits tagged events: `[CRASH]`, `[EXIT]`, `[WARN]`, `[EMERGENCY]`, `[LOOP]`, `[SKIPPED]`                                       |
| **Circular detection**      | Sequence matching (len 2–5) + `uniqueRatio` over 20-action window (threshold 0.35). Normalized signatures: `toolName:key`                      |
| **Per-sig failure counter** | Consecutive failures for same action signature → auto-skip after 3. Resets on success                                                          |
| **Stall detection**         | 5 consecutive iterations where all tools fail → force finish. Early warning at 3 consecutive fails                                             |
| **Budget checkpoints**      | Every 10 iterations (`CHECKPOINT_INTERVAL`), inject checkpoint message forcing agent to assess hypotheses and decide: continue or finish       |
| **Evidence sufficiency**    | Prompt teaches agent: console error + location = FINISH, reproduced + network = FINISH. "Calling finish_investigation is NEVER wrong"          |
| **Emergency finish**        | Graph always returns a `FinishResult` — if agent doesn't call `finish_investigation`, `emergencyNode` produces a partial report with reasoning |

---

## 5. Observability & Reporting

`engine/src/observability/`

| File                      | Role                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `event-bus.ts`            | Typed pub/sub — `emit()`, `subscribe()`, `clear()` for `AgentEvent`     |
| `step-aggregator.ts`      | Transform `AgentEvent` → `InvestigationStep` with type/summary/metadata |
| `investigation-logger.ts` | In-memory token/cost tracking (file-free)                               |
| `logger.ts`               | Console logger — subscribes to EventBus                                 |

**Data flow:**

```
agentLoop emits AgentEvent
    │
    ├── EventBus.subscribe() → StepAggregator → InvestigationStep
    ├── EventBus.subscribe() → InvestigationLogger → in-memory token tracking
    ├── EventBus.subscribe() → ThreadService.handleEvent → SQLite (events table)
    ├── EventBus.subscribe() → ThreadService (artifact_captured) → SQLite (artifacts table)
    └── EventBus.subscribe() → SSE stream → Web Dashboard (inline display)

graph.invoke() returns finalState.result (FinishResult)
    │
    └── buildReport() → InvestigationReport
        └── ThreadService.completeThread() → SQLite (threads.report JSON)
```

**Investigation logger tracks:**

- Token usage per LLM call (prompt + completion)
- Estimated cost ($0.15/1M input, $0.60/1M output)
- Total duration

### 5.1 InvestigationService (Pipeline Orchestrator)

`engine/src/service/investigation-service.ts`

Orchestrates the full pipeline:

```
runInvestigationPipeline(request, deps)
  → loadConfig(overrides)
  → createEventBus()
  → createInvestigationLogger(eventBus, url, hint)
  → createPlaywrightBridge(headless)
  → createChatModel(config)
  → convertTools(openAiTools → LangChainTool[])
  → createInvestigationGraph({ model, tools, fetchJsSnippet })
  → graph.invoke(initialState, { configurable, recursionLimit: 200 })
  → buildReport(result, url, startTime)
  → logger.writeFooter() (token + cost summary)
```

Source map tools (`fetch_source_map`, `resolve_error_location`) are called directly via `sourceMapCall()` — no subprocess or MCP protocol overhead.

---

## 6. REST API

Hono server on `:3100`.

| Method | Path                       | Description                                         |
| ------ | -------------------------- | --------------------------------------------------- |
| `GET`  | `/`                        | Service info                                        |
| `GET`  | `/health`                  | Health check                                        |
| `GET`  | `/investigate`             | List all threads                                    |
| `POST` | `/investigate`             | Start investigation → `{ threadId, queuePosition }` |
| `GET`  | `/investigate/:id`         | Get thread + report                                 |
| `GET`  | `/investigate/:id/events`  | Get all events                                      |
| `GET`  | `/investigate/:id/stream`  | SSE event stream                                    |
| `POST` | `/investigate/:id/message` | Send user message (interactive)                     |
| `GET`  | `/reports`                 | List completed reports                              |

**Architecture:** Routes → ThreadService (business logic) → ThreadRepository + ArtifactRepository (Drizzle ORM) → SQLite

### 6.1 Investigation Queue

ThreadService uses a **promise-chain mutex** to serialize investigations (single browser instance):

- POST `/investigate` returns `queuePosition` (0 = running immediately)
- If `queuePosition > 0`, thread status is `queued` and SSE emits `investigation_queued` event
- FE shows running/queued status banners, disables input form during active investigations
- Thread statuses: `running` → `done` | `error` | `queued` → `running` → `done` | `error`

**Middleware stack:** `requestLogger` → `apiKeyAuth` → `errorHandler`

**Database:** SQLite via `better-sqlite3` + Drizzle ORM

- `threads` table: id, status, url, hint, mode, report (JSON), error, created_at
- `events` table: id, thread_id (FK), data (JSON AgentEvent), created_at
- `artifacts` table: id, thread_id (FK), type, name, content, tool_call_id, created_at

### 6.2 SSE Events

```typescript
type AgentEvent =
  | { type: 'reasoning'; agent: AgentName; text: string }
  | { type: 'tool_call'; agent: AgentName; tool: string; args: unknown }
  | {
      type: 'tool_result';
      agent: AgentName;
      tool: string;
      success: boolean;
      durationMs: number;
      result?: string;
    }
  | { type: 'llm_usage'; agent: AgentName; promptTokens: number; completionTokens: number }
  | { type: 'error'; agent: AgentName; message: string }
  | { type: 'investigation_phase'; phase: InvestigationPhase }
  | { type: 'investigation_queued'; position: number; message: string }
  | { type: 'sourcemap_resolved'; bundleUrl: string; originalFile: string; line: number }
  | { type: 'sourcemap_failed'; bundleUrl: string; reason: string }
  | { type: 'screenshot_captured'; agent: AgentName; data: string }
  | { type: 'waiting_for_input'; agent: AgentName; prompt: string }
  | {
      type: 'artifact_captured';
      artifactType: ArtifactType;
      name: string;
      content: string;
      toolCallId?: string;
    };
```

---

## 7. Key Types

```typescript
// shared/domain.ts
type CodeLocation = {
  file: string;
  line: number;
  column?: number;
  snippet?: string;
};

type InvestigationReport = {
  summary: string;
  rootCause: string;
  codeLocation: CodeLocation | null;
  dataFlow: string;
  suggestedFix: { file: string; line: number; before: string; after: string; explanation: string } | null;
  reproSteps: string[];
  evidence: Evidence[];
  networkFindings: string[];
  timeline: string[];
  hypotheses: { id: string; text: string; status: 'confirmed' | 'rejected' | 'plausible' | 'untested' }[];
  conclusion: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cannotDetermine: boolean;
  assumptions: string[];
  timestamp: string;
  url: string;
  durationMs: number;
};

type Evidence = { type: string; description: string; data?: unknown };

// shared/agent.ts
type InvestigationPhase = 'scouting' | 'investigating' | 'source_analysis' | 'reflecting' | 'synthesizing';
type StepType = 'thinking' | 'action' | 'result' | 'phase_change' | 'error';
type InvestigationStep = { timestamp: string; agent: AgentName; type: StepType; summary: string; detail?: string; metadata?: Record<string, unknown> };

// shared/schemas.ts (Zod validation)
InvestigationRequestSchema = { url, hint?, mode (default: 'autonomous'), callbackUrl?, sourcemapDir?, config? }
```

---

## 8. Config

3-layer: `ai-debug.config.json` → request override → defaults.

```jsonc
{
  "baseUrl": "http://localhost:3000",
  "llm": {
    "default": {
      "provider": "ollama-cloud",
      "model": "qwen3-coder:480b",
      "baseURL": "https://ollama.com/v1",
      "apiKey": "$OLLAMA_API_KEY",
      "supportsVision": false,
    },
  },
  "agent": {
    "maxIterations": 50, // Budget per investigation
    "contextWindow": 128000, // LLM context window size
    "taskTimeoutMs": 90000,
    "maxRetries": 3,
    "mode": "interactive", // or "autonomous"
  },
  "browser": {
    "headless": true, // false to watch browser
    "slowMo": 0,
    "timeout": 30000,
    "viewport": { "width": 1280, "height": 720 },
  },
  "sourcemap": {
    "enabled": true,
    "localPath": null,
    "buildDir": "./dist",
  },
  "output": {
    "reportsDir": "./debug-reports",
    "streamLevel": "summary",
  },
}
```

API keys resolve `$ENV_VAR` syntax automatically.

> **Note:** `mode` defaults to `'interactive'` in config schema but `'autonomous'` in `InvestigationRequestSchema` and web dashboard settings store. Request-level mode takes precedence.

---

## 9. MCP Server

Exposes `investigate_bug` tool via stdio for MCP hosts (Claude, Cursor).

Source files organized as:

- `tools/` — tool implementations (investigate-bug, fetch-source-map, resolve-error-location, finish-investigation, ask-user)
- `sourcemap/` — consumer, fetcher, resolver, tracer, fallback
- `constants/` — tool definitions, browser settings, guardrails, selectors
- `types/` — actions, browser, DOM, guardrails, network

**Source Map Tools (internal):**

| Tool                     | Description                                                                   |
| ------------------------ | ----------------------------------------------------------------------------- |
| `fetch_source_map`       | Download .map file from bundle URL                                            |
| `resolve_error_location` | Map minified line:col → original file:line (includes surroundingCode snippet) |

---

## 10. Web Dashboard

Vite + React SPA on `:5173`. 40 source files.

**State management:** Zustand

- `investigation-store.ts` — investigation CRUD, SSE connection, hydration from API, message sending
- `settings-store.ts` — API key (localStorage), investigation mode (default: autonomous)

**API layer:** `ky` HTTP client → `/api` prefix, auto-injects `X-API-Key` from localStorage

**Design system:** `design-system/` — CSS tokens, global styles, animations

**Components (4 layers):**

| Layer      | Components                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primitives | Button, Skeleton, StatusDot                                                                                                                                            |
| Composites | ProgressStepper, CollapsibleSection                                                                                                                                    |
| Features   | ChatPanel, ChatInput, ChatMessage, ReportPanel, EvidencePanel, PhaseGroup, MarkdownRenderer, Sidebar, Header                                                           |
| Events     | ReasoningEvent, ToolCallEvent, ErrorEvent, PhaseEvent, ScreenshotEvent, SourceMapEvent, WaitingForInputEvent, ArtifactEvent, QueuedEvent, LlmUsageEvent, result-parser |

**Other:** `ErrorBoundary.tsx` (root error boundary), `lib/utils.ts` (utility functions)

**Key features:**

- Real-time SSE event stream → chat UI
- Auto-reconnect SSE for running investigations on page reload (hydration)
- 5-phase ProgressStepper with current phase highlighting
- Expandable tool call/result cards with parsed result display
- Report panel with severity, evidence, code location, network findings
- Evidence panel with artifact display (snapshots, console, network)
- Interactive message input for `ask_user` responses
- Vite proxy: `/api` → `http://localhost:3100`

---

## 11. Data Flow

```
User (Web) → API
  → ThreadService.createThread() → SQLite insert
  → ThreadService.startPipeline()
    → runInvestigationPipeline(request, deps)
      → loadConfig(overrides)
      → createEventBus() + createInvestigationLogger()
      → createPlaywrightBridge(headless) → Chromium
      → createChatModel(config)
      → convertTools(openAiTools → LangChainTool[])
      → createInvestigationGraph({ model, tools, fetchJsSnippet })
      → graph.invoke(initialState, { configurable, recursionLimit: 200 })
        → [agent node → parallel tool dispatch → after_tools → budget awareness]
        → triedActions[] tracks episodic memory
        → RECOVERABLE_PATTERNS retry Playwright errors
        → FinishResult (from finish_investigation or emergencyNode)
      → buildReport(result, url, startTime)
      → logger.writeFooter() (token/cost summary)
  → ThreadService.completeThread() → SQLite update
  → SSE stream / API response
```
