# AI Debug Agent — Architecture v7.0

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
│   ├── agent.ts         # AgentEvent, InvestigationStep, INVESTIGATION_PHASE
│   ├── domain.ts        # InvestigationReport, CodeLocation, Evidence, modes
│   ├── browser.ts       # CapturedLog, CapturedRequest, CorrelatedEvidence
│   ├── schemas.ts       # Zod: InvestigationRequestSchema (input validation)
│   └── types.ts         # Barrel re-export
├── engine/              # Core: agent loop, LLM, Playwright bridge, source maps
│   ├── agent/           # Loop, helpers, tools, prompts, bridges, config
│   ├── sourcemap/       # Source map consumer, fetcher, resolver, tracer
│   ├── observability/   # EventBus, InvestigationLogger, StepAggregator
│   ├── reporter/        # Markdown report generator
│   └── service/         # InvestigationService (pipeline orchestrator)
├── api/                 # Hono REST API + SQLite + SSE streaming
│   ├── routes/          # investigate.ts, reports.ts
│   ├── services/        # ThreadService (business logic)
│   ├── repositories/    # ThreadRepository (Drizzle ORM data access)
│   ├── middleware/      # auth, error-handler, request-logger
│   ├── db/              # schema.ts, client.ts (SQLite + Drizzle)
│   └── lib/             # logger.ts, response.ts
└── web/                 # Vite + React dashboard
    ├── stores/          # Zustand: investigation-store, settings-store
    ├── api/             # HTTP client (ky), SSE, type mirrors
    └── components/      # Composites, features, primitives
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
           │  │        Agent Loop (single)        │  │
           │  │                                  │  │
           │  │  LLM ──► Tool Call ──► Execute ─┐│  │
           │  │   ▲                             ││  │
           │  │   └── Tool Result ◄─────────────┘│  │
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
  │        MAIN LOOP (max 50)        │
  │                                  │
  │  1. Call LLM (parallel tool calls) │
  │  2. OBSERVE → PLAN reasoning      │
  │  3. Execute tool calls            │
  │  4. If finish_investigation →     │
  │     return FinishResult           │
  │  5. Token-based budget awareness  │
  │  6. Proactive context compression │
  │  7. Stall detection               │
  │  8. Repeat                        │
  └──────────────────────────────────┘
         │
         ▼
  FinishResult → buildReport() → InvestigationReport
```

### 4.2 Key Files

| File                      | Role                                                                              |
| ------------------------- | --------------------------------------------------------------------------------- |
| `agent-loop.ts`           | Main loop: LLM call → parallel tool dispatch → budget awareness → episodic memory |
| `agent-loop.helpers.ts`   | LLM retry (HTTP + timeout/network), result parsing, smart context compression     |
| `agent-loop.tools.ts`     | Tool definitions: FINISH_TOOL, SOURCE_MAP_TOOLS, ASK_USER, FETCH_JS_SNIPPET       |
| `agent-loop.types.ts`     | FinishResult, AgentLoopDeps types                                                 |
| `agent-loop.normalize.ts` | Parse LLM args → FinishResult                                                     |
| `prompts.ts`              | System prompt: OBSERVE→PLAN, INVESTIGATION STRATEGIES, BUDGET AWARENESS           |
| `llm-client.ts`           | OpenAI SDK wrapper                                                                |
| `config-loader.ts`        | 3-layer config: file → env → request → defaults                                   |
| `bridge-factory.ts`       | Centralized MCP bridge creation (subprocess + in-process modes)                   |
| `playwright-bridge.ts`    | Playwright MCP client connection                                                  |
| `mcp-bridge.ts`           | MCP Server bridge for source map tools                                            |
| `message-queue.ts`        | User message queue for interactive mode                                           |
| `snapshot-summarizer.ts`  | Compress large snapshots for context window                                       |

### 4.3 Continuous Budget Awareness

Instead of periodic checkpoint injection, the agent receives **token-based** budget context on **every** LLM call:

```
[Context: 0/128,000 tokens (0%)]
[Context: 45,200/128,000 tokens (35%)] [Failed: resolve_error_location({...})]
[Context: 112,000/128,000 tokens (88%)] [Failed: ...]
```

The system prompt teaches the agent to self-regulate:

- `> 60%` → wrap up, confirm strongest hypothesis
- `> 85%` → call `finish_investigation` with whatever evidence available
- Last iteration → FORCE_FINISH_MESSAGE (safety net)

Token-based is more accurate than iteration-based: one iteration with 5 parallel tools consumes ~5x more context than one iteration with 1 tool.

### 4.4 Agent Resilience Features

| Feature                       | Implementation                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Parallel tool execution**   | `Promise.allSettled` — executes multiple tool calls from a single LLM response                                                                          |
| **Episodic memory**           | `triedActions[]` tracks tool+args+success per iteration, prevents loops                                                                                 |
| **Duplicate detection**       | Skip re-execution of tool+args that already failed, inject guidance message                                                                             |
| **LLM retry**                 | Retries on HTTP 429/500-504 AND timeout/network errors (max 2 retries)                                                                                  |
| **Playwright error recovery** | `RECOVERABLE_PATTERNS` match timeout/navigation/page crash → auto-retry                                                                                 |
| **Proactive context mgmt**    | Dynamic sliding window: 5→3→1 based on token usage %, type-aware compression                                                                            |
| **Token-based budget**        | `[Context: X/Y tokens (Z%)]` on every call — agent self-regulates                                                                                       |
| **Stall detection**           | 3+ consecutive failed iterations → warning; 5+ → force finish                                                                                           |
| **Self-assessment**           | Agent checks "any untried strategy left?" after each OBSERVE → finishes if exhausted                                                                    |
| **Force finish**              | Last iteration: mandatory `finish_investigation` with whatever evidence                                                                                 |
| **Emergency finish**          | If agent exhausts budget without `finish_investigation` → `buildEmergencyResult` synthesizes partial report from collected evidence. Never returns null |
| **Crash state detection**     | Empty page snapshot → inject guidance: "finish with evidence you have, do not re-navigate"                                                              |
| **Circular nav detection**    | Last 8 actions uniqueRatio < 0.5 → inject warning: "repeating same sequence, finish now"                                                                |
| **Purposeful exploration**    | Prompt teaches: continue only if unanswered question + budget < 60% + different action                                                                  |

### 4.5 Tool Categories

**Playwright MCP (browser interaction):**
`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_select_option`, `browser_hover`, `browser_scroll`, `browser_console_messages`, `browser_network_requests`, `browser_wait_for`

**Source Map (code resolution):**
`fetch_source_map`, `resolve_error_location`, `read_source_file`

**Custom tools:**

- `finish_investigation` — submit bug report with findings + timeline
- `ask_user` — ask user questions (interactive mode, uncertainty-based)
- `fetch_js_snippet` — fetch minified JS and extract lines around error

**State inspection (via `browser_evaluate`):**
Framework detection (React/Vue/Redux) → read-only state extraction. Guardrails: no mutations, no side effects.

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

---

## 5. Observability & Reporting

`engine/src/observability/` + `engine/src/reporter/`

| File                      | Role                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `event-bus.ts`            | Typed pub/sub — `emit()`, `subscribe()`, `clear()` for `AgentEvent`     |
| `step-aggregator.ts`      | Transform `AgentEvent` → `InvestigationStep` with type/summary/metadata |
| `investigation-logger.ts` | Persist investigation to markdown log file with token/cost tracking     |
| `logger.ts`               | Shared pino logger instance                                             |
| `reporter/report.ts`      | `buildMarkdown()` → full investigation report · `saveReport()` to disk  |

**Data flow:**

```
agentLoop emits AgentEvent
    │
    ├── EventBus.subscribe() → StepAggregator → InvestigationStep
    ├── EventBus.subscribe() → InvestigationLogger → markdown log file
    ├── EventBus.subscribe() → ThreadService.handleEvent → SQLite (events table)
    └── EventBus.subscribe() → SSE stream → Web Dashboard

agentLoop returns FinishResult
    │
    └── InvestigationService.buildReport() → InvestigationReport
        ├── saveReport() → debug-reports/*.md
        └── ThreadService.completeThread() → SQLite (threads.report)
```

**Investigation logger tracks:**

- Token usage per LLM call (prompt + completion)
- Estimated cost ($0.15/1M input, $0.60/1M output)
- Total duration
- All events formatted as readable markdown

### 5.1 InvestigationService (Pipeline Orchestrator)

`engine/src/service/investigation-service.ts`

Orchestrates the full pipeline:

```
runInvestigationPipeline(request, deps)
  → loadConfig(overrides)
  → createEventBus()
  → createInvestigationLogger(eventBus, url, hint)
  → createPlaywrightBridge(headless)
  → createLLMClient(config)
  → runAgentLoop(url, hint, deps)     // returns FinishResult (never null — emergency finish as safety net)
  → buildReport(result, url, startTime)
  → logger.writeFooter() (token + cost summary)
```

Source map tools (`fetch_source_map`, `resolve_error_location`, `read_source_file`) are called directly via `sourceMapCall()` — no subprocess or MCP protocol overhead.

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

**Architecture:** Routes → ThreadService (business logic) → ThreadRepository (Drizzle ORM) → SQLite

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

### 6.1 SSE Events

```typescript
type AgentEvent =
  | { type: 'reasoning'; agent: string; text: string }
  | { type: 'tool_call'; agent: string; tool: string; args: unknown }
  | {
      type: 'tool_result';
      agent: string;
      tool: string;
      success: boolean;
      durationMs: number;
      result?: string;
    }
  | { type: 'llm_usage'; agent: string; promptTokens: number; completionTokens: number }
  | { type: 'error'; agent: string; message: string }
  | { type: 'investigation_phase'; phase: InvestigationPhase } // investigating | synthesizing | reflecting
  | { type: 'sourcemap_resolved'; bundleUrl: string; originalFile: string; line: number }
  | { type: 'sourcemap_failed'; bundleUrl: string; reason: string }
  | { type: 'screenshot_captured'; agent: string; data: string }
  | { type: 'waiting_for_input'; agent: string; prompt: string };
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
  severity: 'critical' | 'high' | 'medium' | 'low';
  cannotDetermine: boolean;
  assumptions: string[];
  timestamp: string;
  url: string;
  durationMs: number;
};

type Evidence = { type: string; description: string; data?: unknown };

// shared/agent.ts
type InvestigationPhase = 'investigating' | 'synthesizing' | 'reflecting';
type StepType = 'thinking' | 'action' | 'result' | 'phase_change' | 'error';
type InvestigationStep = { timestamp: string; agent: string; type: StepType; summary: string; detail?: string; metadata?: Record<string, unknown> };

// shared/schemas.ts (Zod validation)
InvestigationRequestSchema = { url, hint?, mode, callbackUrl?, sourcemapDir?, config? }
```

---

## 8. Config

3-layer: `ai-debug.config.json` → request override → defaults.

```jsonc
{
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
  "output": {
    "reportsDir": "./debug-reports",
    "streamLevel": "summary",
  },
}
```

API keys resolve `$ENV_VAR` syntax automatically.

---

## 9. MCP Server

Exposes `investigate_bug` tool via stdio for MCP hosts (Claude, Cursor).

51 source files organized as:

- `tools/` — 7 tool implementations (investigate-bug, fetch-source-map, resolve-error-location, read-source-file, finish-investigation, ask-user, dispatch-browser-task)
- `sourcemap/` — consumer, fetcher, resolver, tracer, reader, fallback
- `constants/` — tool definitions, browser settings, guardrails, selectors
- `types/` — actions, browser, DOM, guardrails, network

**Source Map Tools (internal):**

| Tool                     | Description                                |
| ------------------------ | ------------------------------------------ |
| `fetch_source_map`       | Download .map file from bundle URL         |
| `resolve_error_location` | Map minified line:col → original file:line |
| `read_source_file`       | Read original source code around error     |

---

## 10. Web Dashboard

Vite + React SPA on `:5173`. 34 source files.

**State management:** Zustand

- `investigation-store.ts` — investigation CRUD, SSE connection, hydration from API, message sending
- `settings-store.ts` — API key (localStorage), investigation mode (interactive/autonomous)

**API layer:** `ky` HTTP client → `/api` prefix, auto-injects `X-API-Key` from localStorage

**Components (3 layers):**

| Layer      | Components                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Primitives | Badge, Button, GlassCard, Input, Skeleton, StatusDot                                                                        |
| Composites | ProgressStepper (Scout→Plan→Execute→Reflect→Report), CollapsibleSection                                                     |
| Features   | ChatPanel, ChatInput, ChatMessage, ReportPanel, MarkdownRenderer, Sidebar, Header                                           |
| Events     | ReasoningEvent, ToolCallEvent, ErrorEvent, LlmUsageEvent, PhaseEvent, ScreenshotEvent, SourceMapEvent, WaitingForInputEvent |

**Key features:**

- Real-time SSE event stream → chat UI
- Auto-reconnect SSE for running investigations on page reload (hydration)
- 5-phase ProgressStepper with current phase highlighting
- Expandable tool call/result cards
- Report panel with severity, evidence, code location, network findings
- Interactive message input for `ask_user` responses
- Vite proxy: `/api` → `http://localhost:3100`

---

## 11. Data Flow

```
User (Web) → API
  → ThreadService.createThread() → SQLite insert
  → ThreadService.startPipeline()
    → runInvestigationPipeline()
      → loadConfig(overrides)
      → createEventBus() + createInvestigationLogger()
      → createPlaywrightBridge(headless) → Chromium
      → createLLMClient(config)
      → runAgentLoop(url, hint, deps)
        → [LLM call → parallel tool dispatch → token-based budget awareness]
        → triedActions[] tracks episodic memory
        → RECOVERABLE_PATTERNS retry Playwright errors
        → FinishResult
      → buildReport(result, url, startTime)
      → logger.writeFooter() (token/cost summary)
  → ThreadService.completeThread() → SQLite update
  → SSE stream / API response
```
