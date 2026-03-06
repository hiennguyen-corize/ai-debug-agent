# AI Debug Agent — Architecture v7.0

> **Single Agent Loop architecture.** One LLM agent controls a real browser via Playwright MCP, investigates bugs autonomously, and produces structured reports.

---

## 1. Overview

### 1.1 Problem

Developer gặp bug → mở browser → thao tác → đọc console → đọc network → tìm source map → trace flow → đoán nguyên nhân. Mất 30–60 phút.

**AI Debug Agent** thay thế toàn bộ. Input: URL + hint → Output: structured report.

### 1.2 Design Philosophy

- **Single agent loop** — one LLM, one browser, one conversation
- **Budget-aware** — checkpoint mỗi 10 iterations, force finish khi hết budget
- **Deep analysis** — network → source maps → minified JS fallback → narrow down
- **THINK OUT LOUD** — agent viết reasoning trước mỗi tool call, user thấy real-time

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
├── mcp-server/          # MCP Server: source map tools, investigate_bug tool
│   ├── tools/           # Tool implementations (7 tools)
│   ├── sourcemap/       # Source map consumer, fetcher, resolver, tracer
│   ├── constants/       # Tool definitions, browser settings, guardrails
│   └── types/           # Actions, browser, DOM, network types
├── mcp-client/          # Core: agent loop, LLM, Playwright bridge
│   ├── agent/           # Loop, helpers, tools, prompts, bridges, config
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
shared ← mcp-client ← mcp-server
                     ← api
         web (standalone, mirrors shared types via api/types.ts)
```

---

## 3. System Diagram

```
┌────────────────────────────────────────────────────────────┐
│                        Consumers                           │
│  MCP Host (Claude/Cursor)  │  Web Dashboard  │  REST API   │
└──────────┬─────────────────┼────────────────┼─────────────┘
           │                 │                │
     ┌─────▼──────┐   ┌─────▼──────┐  ┌─────▼──────┐
     │ mcp-server │   │    web/    │  │    api/    │
     │  (stdio)   │   │  (Vite)   │  │  (Hono)   │
     └─────┬──────┘   └───────────┘  └─────┬──────┘
           │                                │
           └──────────┬─────────────────────┘
                      │
           ┌──────────▼────────────────────────────────┐
           │              mcp-client/                   │
           │                                            │
           │  ┌──────────────────────────────────────┐  │
           │  │          Agent Loop (single)          │  │
           │  │                                      │  │
           │  │  LLM ──► Tool Call ──► Execute ──┐   │  │
           │  │   ▲                              │   │  │
           │  │   └── Tool Result ◄──────────────┘   │  │
           │  │                                      │  │
           │  │  Checkpoints every 10 iterations     │  │
           │  │  Force finish at iteration 50        │  │
           │  └──┬───────────────┬───────────────┬──┘  │
           │     │               │               │      │
           │  Playwright     Source Map     fetch_js     │
           │  MCP Tools      Tools         _snippet     │
           └─────┼───────────────┼───────────────┼──────┘
                 │               │               │
           ┌─────▼──────┐  ┌────▼─────┐   ┌─────▼─────┐
           │ @playwright │  │mcp-server│   │ HTTP fetch│
           │    /mcp     │  │sourcemap │   │ (JS file) │
           │ (Chromium)  │  │ resolver │   └───────────┘
           └─────────────┘  └──────────┘
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
  │  2. Emit reasoning (content)     │
  │  3. Execute tool call            │
  │  4. If finish_investigation →    │
  │     return FinishResult          │
  │  5. Reflection checkpoint / 10 iter │
  │  6. Trim old tool results        │
  │  7. Repeat                       │
  └──────────────────────────────────┘
         │
         ▼
  FinishResult → buildReport() → InvestigationReport
```

### 4.2 Key Files

| File                      | Role                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| `agent-loop.ts`           | Main loop: LLM call → parallel tool dispatch → checkpoints → episodic memory  |
| `agent-loop.helpers.ts`   | LLM retry (HTTP + timeout/network), result parsing, smart context compression |
| `agent-loop.tools.ts`     | Tool definitions: FINISH_TOOL, SOURCE_MAP_TOOLS, ASK_USER, FETCH_JS_SNIPPET   |
| `agent-loop.types.ts`     | FinishResult, AgentLoopDeps types                                             |
| `agent-loop.normalize.ts` | Parse LLM args → FinishResult                                                 |
| `prompts.ts`              | System prompt: THINK OUT LOUD, WORKFLOW, DEEP ANALYSIS                        |
| `llm-client.ts`           | OpenAI SDK wrapper                                                            |
| `config-loader.ts`        | 3-layer config: file → env → request → defaults                               |
| `bridge-factory.ts`       | Centralized MCP bridge creation (subprocess + in-process modes)               |
| `playwright-bridge.ts`    | Playwright MCP client connection                                              |
| `mcp-bridge.ts`           | MCP Server bridge for source map tools                                        |
| `message-queue.ts`        | User message queue for interactive mode                                       |
| `snapshot-summarizer.ts`  | Compress large snapshots for context window                                   |

### 4.3 Budget-Aware Reflection Checkpoints

```
Iteration 10  → "⚠️ REFLECTION CHECKPOINT: REFLECT → EVALUATE → DECIDE + failed action history"
Iteration 20  → "⚠️ REFLECTION CHECKPOINT: ...updated history..."
Iteration 30  → "⚠️ REFLECTION CHECKPOINT: ..." + ⚠️ WARNING: budget > 60%, wrap up
Iteration 40  → "⚠️ REFLECTION CHECKPOINT: ..." + 🚨 CRITICAL: must finish next turn
Iteration 49  → FORCE_FINISH_MESSAGE (mandatory finish)
```

### 4.4 Agent Resilience Features

| Feature                       | Implementation                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------ |
| **Parallel tool execution**   | `Promise.allSettled` — executes multiple tool calls from a single LLM response |
| **Episodic memory**           | `triedActions[]` tracks tool+args+success per iteration, prevents loops        |
| **LLM retry**                 | Retries on HTTP 429/500-504 AND timeout/network errors (max 2 retries)         |
| **Playwright error recovery** | `RECOVERABLE_PATTERNS` match timeout/navigation/page crash → auto-retry        |
| **Smart context compression** | Type-aware: network→keep status+URLs, errors→first 5 lines, code→6 lines       |
| **Escalating urgency**        | Iter 30: ⚠️ WARNING wrap up · Iter 40: 🚨 CRITICAL must finish next turn       |
| **Force finish**              | Iter 49: mandatory `finish_investigation` with whatever evidence is available  |

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

### 4.6 Deep Analysis Workflow

```
Error found in console
      │
      ▼
1. Reconstruct EVENT TIMELINE: actions → network → console
      │
      ▼
2. browser_network_requests → check failed API calls
      │
      ▼
3. Source Maps (preferred):
   fetch_source_map → resolve_error_location → read_source_file
      │
      ▼ (if source maps fail)
4. fetch_js_snippet → read minified code around error line
      │
      ▼
5. Hypothesize & Test:
   - Form H1/H2/H3 from evidence
   - Test most promising hypothesis first
   - Trace backwards: error → value → source → API
      │
      ▼
6. State Inspection (if null/undefined suspected):
   - browser_evaluate → detect framework → read state
      │
      ▼
finish_investigation (with timeline + findings)
```

---

## 5. Observability & Reporting

`mcp-client/src/observability/` + `mcp-client/src/reporter/`

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

`mcp-client/src/service/investigation-service.ts`

Orchestrates the full pipeline:

```
runInvestigationPipeline(request, deps)
  → loadConfig(overrides)
  → createEventBus()
  → createInvestigationLogger(eventBus, url, hint)
  → createPlaywrightBridge(headless)
  → createLLMClient(config)
  → runAgentLoop(url, hint, deps)
  → buildReport(result, url, startTime)
  → logger.writeFooter() (token + cost summary)
```

### 5.2 Bridge Factory

`mcp-client/src/agent/bridge-factory.ts`

| Function                | Use Case                                             |
| ----------------------- | ---------------------------------------------------- |
| `createDefaultBridge`   | Subprocess: spawns mcp-server via stdio (production) |
| `createBridgeForServer` | In-process: direct server ref (testing)              |

---

## 6. REST API

Hono server on `:3100`.

| Method | Path                       | Description                          |
| ------ | -------------------------- | ------------------------------------ |
| `GET`  | `/`                        | Service info                         |
| `GET`  | `/health`                  | Health check                         |
| `GET`  | `/investigate`             | List all threads                     |
| `POST` | `/investigate`             | Start investigation → `{ threadId }` |
| `GET`  | `/investigate/:id`         | Get thread + report                  |
| `GET`  | `/investigate/:id/events`  | Get all events                       |
| `GET`  | `/investigate/:id/stream`  | SSE event stream                     |
| `POST` | `/investigate/:id/message` | Send user message (interactive)      |
| `GET`  | `/reports`                 | List completed reports               |

**Architecture:** Routes → ThreadService (business logic) → ThreadRepository (Drizzle ORM) → SQLite

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
User (Web/MCP) → API/MCP Server
  → ThreadService.createThread() → SQLite insert
  → ThreadService.startPipeline()
    → createDefaultBridge() → spawn mcp-server subprocess
    → runInvestigationPipeline()
      → loadConfig(overrides)
      → createEventBus() + createInvestigationLogger()
      → createPlaywrightBridge(headless) → Chromium
      → createLLMClient(config)
      → runAgentLoop(url, hint, deps)
        → [LLM call → parallel tool dispatch → reflection checkpoints]
        → triedActions[] tracks episodic memory
        → RECOVERABLE_PATTERNS retry Playwright errors
        → FinishResult
      → buildReport(result, url, startTime)
      → logger.writeFooter() (token/cost summary)
    → bridge.close()
  → ThreadService.completeThread() → SQLite update
  → SSE stream / API response
```
