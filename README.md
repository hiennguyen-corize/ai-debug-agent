# AI Debug Agent

> **v7.2** — Single Agent Loop Architecture

AI-powered web application debugger. Give it a URL and a bug description → it investigates autonomously using a real browser, builds hypotheses, resolves source maps, and produces a structured root cause report.

```
Developer → POST /investigate (REST)
                    │
                    ▼
            ┌──────────────┐
            │    engine     │  Single Agent Loop (LangGraph)
            │               │
            │  LLM → Playwright + Source Map → Report
            └──────────────┘
```

**One LLM agent. One browser. One conversation.** The agent chooses investigation strategy based on observed evidence — not a hardcoded sequence.

---

## Quick Start

### 1. Prerequisites

| Requirement             | Version                                |
| ----------------------- | -------------------------------------- |
| **Node.js**             | ≥ 24 (see `.nvmrc`)                   |
| **pnpm**                | ≥ 9                                    |
| **Playwright browsers** | Installed via `npx playwright install` |

### 2. Install

```bash
# Clone & install dependencies
pnpm install

# Install Playwright browsers (Chromium required)
npx playwright install chromium
```

### 3. Configure

#### Environment Variables

```bash
cp .env.example .env
```

Edit `.env` — at minimum set one LLM API key:

```bash
# Required — at least one LLM provider
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_API_KEY=

# REST API server
PORT=3100
AI_DEBUG_API_KEY=          # leave empty to disable auth in dev

# Browser
BROWSER_HEADLESS=true      # set to "false" to watch browser
```

#### Config File

```bash
cp ai-debug.config.example.json ai-debug.config.json
```

Edit `ai-debug.config.json` — API keys reference env vars with `$` prefix:

```jsonc
{
  "llm": {
    "default": {
      "provider": "openai",
      "model": "gpt-4o",
      "apiKey": "$OPENAI_API_KEY"   // ← reads from .env automatically
    }
  },
  "agent": {
    "mode": "autonomous",           // "autonomous" | "interactive"
    "maxIterations": 30,
    "maxRetries": 3
  },
  "browser": {
    "headless": true
  },
  "output": {
    "reportsDir": "./debug-reports",
    "streamLevel": "summary"        // "summary" | "verbose"
  }
}
```

**Config precedence:** `request overrides` > `env vars (.env)` > `ai-debug.config.json` > `defaults`

### 4. Build & Run

```bash
# Build all packages
pnpm run build

# Start API server (http://localhost:3100)
pnpm run dev:api

# Start web dashboard (http://localhost:5173)
pnpm --filter @ai-debug/web run dev
```

---

## Architecture

### How It Works

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

The agent uses an **evidence-driven** investigation strategy:
- **Console errors?** → source maps → root cause
- **UI wrong?** → snapshot + state inspection
- **Network issue?** → check responses/payloads
- **Interaction bug?** → reproduce + observe
- **No progress after 2 attempts?** → switch strategy

### Key Design Principles

- **Single agent loop** — one LLM, one browser, one conversation
- **Budget-aware** — continuous `[Context: X/Y tokens (Z%)]` on every LLM call
- **Evidence-driven** — adapts strategy based on what it observes
- **OBSERVE → PLAN** — agent synthesizes results + updates hypothesis before each action

### Agent Resilience

| Feature | Description |
| --- | --- |
| **Parallel tool execution** | `Promise.allSettled` for multiple tool calls per iteration |
| **Episodic memory** | `triedActions[]` tracks what worked/failed, prevents loops |
| **Token-based budget** | Agent self-regulates: >60% wrap up, >85% force finish |
| **Stall detection** | 3+ consecutive failures → warning; 5+ → force finish |
| **Circular nav detection** | Pattern matching over last 20 actions → inject warning |
| **Emergency finish** | Always produces a report — even if agent doesn't call `finish_investigation` |
| **Playwright error recovery** | Auto-retry on timeout/navigation/page crash |
| **Result truncation** | Per-tool output size limits (snapshot: 4K, network: 3K, console: 2K) |

---

## Monorepo Structure

```
ai-debug-agent/
├── shared/           # Types, schemas, constants — zero runtime deps
│   ├── agent.ts          AgentEvent, InvestigationStep, phases
│   ├── domain.ts         InvestigationReport, CodeLocation, Evidence
│   ├── browser.ts        CapturedLog, CapturedRequest
│   ├── schemas.ts        Zod: InvestigationRequestSchema
│   └── types.ts          Barrel re-export
├── engine/           # Core: LangGraph agent, Playwright bridge, source maps
│   ├── agent/
│   │   ├── graph/        LangGraph orchestration: nodes, state, dispatch
│   │   ├── loop/         Tool definitions, prompts, snapshot compression
│   │   └── tools/        Custom tools (fetch-js-snippet, sourcemap-tools)
│   ├── sourcemap/        Source map consumer, fetcher, resolver
│   ├── observability/    EventBus, InvestigationLogger, StepAggregator
│   ├── reporter/         Report builder
│   └── service/          InvestigationService (pipeline orchestrator)
├── api/              # Hono REST API + SQLite + SSE streaming
│   ├── routes/           /investigate, /reports
│   ├── services/         ThreadService (business logic)
│   ├── repositories/     Drizzle ORM data access
│   ├── middleware/        Auth, error-handler, request-logger
│   └── db/               SQLite schema (Drizzle)
├── web/              # Vite + React 19 dashboard
│   ├── src/
│   │   ├── stores/       Zustand state management
│   │   ├── api/          HTTP client (ky), SSE, type mirrors
│   │   └── components/   Chat UI, report panel, evidence panel
│   └── ...
└── tests/            # Vitest tests
```

**Package dependencies:**

```
shared ← engine ← api
         web (standalone, mirrors shared types)
```

**Tech stack per package:**

| Package | Key Dependencies |
| --- | --- |
| `shared` | Zod |
| `engine` | LangGraph, @playwright/mcp, @langchain/openai, source-map |
| `api` | Hono, better-sqlite3, Drizzle ORM, Pino |
| `web` | React 19, Tailwind CSS v4, Zustand 5, Vite 7, ky |

---

## REST API Reference

Server runs on `:3100`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Service info |
| `GET` | `/health` | Health check |
| `GET` | `/investigate` | List all threads |
| `POST` | `/investigate` | Start investigation |
| `GET` | `/investigate/:id` | Get thread + report |
| `GET` | `/investigate/:id/events` | Get all events |
| `GET` | `/investigate/:id/stream` | SSE event stream |
| `POST` | `/investigate/:id/message` | Send user message (interactive) |
| `GET` | `/reports` | List completed reports |

### `POST /investigate` — Start investigation

```bash
curl -X POST http://localhost:3100/investigate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{
    "url": "https://example.com/cart",
    "hint": "add to cart button crashes",
    "mode": "autonomous"
  }'
```

**Response:** `201`
```json
{ "threadId": "debug-1709500000000", "status": "started" }
```

**Request body:**

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `url` | `string` (URL) | ✅ | — |
| `hint` | `string` | ❌ | — |
| `mode` | `"autonomous" \| "interactive"` | ❌ | `"autonomous"` |
| `callbackUrl` | `string` (URL) | ❌ | — |
| `sourcemapDir` | `string` | ❌ | — |
| `config` | `object` | ❌ | — |

### `GET /investigate/:threadId/stream` — SSE stream

```bash
curl http://localhost:3100/investigate/debug-1709500000000/stream \
  -H "X-API-Key: your-key"
```

Real-time `AgentEvent` stream: reasoning, tool calls, hypotheses, source map resolutions, screenshots, and more.

---

## Investigation Modes

| Mode | Behavior | Use case |
| --- | --- | --- |
| **`autonomous`** | Agent investigates without asking questions | CI/CD, unattended |
| **`interactive`** | Agent can ask user for clarification via `ask_user` tool | Guided debugging |

---

## Tools

**Playwright MCP (browser interaction):**
`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_select_option`, `browser_hover`, `browser_scroll`, `browser_console_messages`, `browser_network_requests`, `browser_evaluate`, `browser_wait_for`

**Source Map (code resolution):**
`fetch_source_map`, `resolve_error_location`

**Custom tools:**
- `finish_investigation` — submit bug report with findings + timeline + hypotheses
- `ask_user` — ask user questions (interactive mode only)
- `fetch_js_snippet` — fetch minified JS and extract lines around error location

---

## Report Output

| Field | Description |
| --- | --- |
| **Summary** | Brief description of the bug |
| **Root Cause** | Technical root cause analysis |
| **Code Location** | Original file:line (via source map) |
| **Suggested Fix** | Explanation and code changes |
| **Evidence** | Console errors, network errors, findings |
| **Hypotheses** | Table with status (confirmed/rejected/plausible) |
| **Repro Steps** | Steps to reproduce |
| **Timeline** | Ordered events leading to the bug |
| **Network Findings** | Relevant API calls and responses |
| **Severity** | critical / high / medium / low |

---

## Using Local Models

Any server with an OpenAI-compatible API works:

| Server | `baseURL` | Install |
| --- | --- | --- |
| **Ollama** | `http://localhost:11434/v1` | `brew install ollama && ollama pull qwen2.5:32b` |
| **LM Studio** | `http://localhost:1234/v1` | Download from lmstudio.ai |
| **vLLM** | `http://localhost:8000/v1` | `pip install vllm` |
| **llama.cpp** | `http://localhost:8080/v1` | Build from source |

```jsonc
{
  "llm": {
    "default": {
      "provider": "ollama",
      "model": "qwen2.5:32b",
      "baseURL": "http://localhost:11434/v1",
      "apiKey": "not-needed"
    }
  }
}
```

---

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI API key (referenced as `$OPENAI_API_KEY` in config) | — |
| `GOOGLE_API_KEY` | Google AI API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `OLLAMA_API_KEY` | Ollama API key | — |
| `AI_DEBUG_API_KEY` | REST API auth (`X-API-Key` header). Empty = no auth (dev) | — |
| `PORT` | REST API server port | `3100` |
| `BROWSER_HEADLESS` | Show browser window (`false` to watch) | `true` |

---

## Development

```bash
pnpm run typecheck       # TypeScript type check (all packages)
pnpm run lint            # ESLint (type-aware, strict)
pnpm run test            # Vitest
pnpm run test:watch      # Vitest watch mode
pnpm run format          # Prettier format
pnpm run format:check    # Prettier check
pnpm run check-all       # typecheck + lint + test
```

---

## Troubleshooting

| Problem | Solution |
| --- | --- |
| `Cannot find module '@ai-debug/shared'` | Run `pnpm run build` — shared package must be built first |
| `browserType.launch: Executable doesn't exist` | Run `npx playwright install chromium` |
| `401 Unauthorized` on API calls | Set `X-API-Key` header, or unset `AI_DEBUG_API_KEY` env for dev mode |
| `ECONNREFUSED` on local model | Verify model server is running (`ollama serve`, LM Studio, etc.) |
| `TypeError: fetch is not a function` | Requires Node.js ≥ 24 for native `fetch` |

---

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Full system architecture, agent loop internals, observability, data flow
- **[ROADMAP.md](./ROADMAP.md)** — Planned capabilities (auth pages, vision, mobile viewport, etc.)
- **[BUGS.md](./BUGS.md)** — Test bugs on [crashed-website.pages.dev](https://crashed-website.pages.dev) for agent validation
