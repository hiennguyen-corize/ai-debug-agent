# AI Debug Agent

> **v4.1** — Investigation-First Architecture

AI-powered web application debugger. Give it a URL and a bug description → it investigates autonomously using browser tools, builds hypotheses, resolves source maps, and produces a root cause report.

## Architecture

```
Developer → POST /investigate (REST) or investigate_bug (MCP)
                    │
                    ▼
            ┌──────────────┐
            │  mcp-client   │  LangGraph Investigation Graph
            │               │
            │  Preflight → Scout → Investigator ↔ Explorer
            │                        │
            │               Source Map → Synthesis → Report
            └──────┬───────┘
                   │
            ┌──────▼───────┐
            │  mcp-server   │  20 MCP Tools (Playwright + Source Map)
            └──────────────┘
```

**Dual interface:** MCP Server (tool calls) + REST API (HTTP/SSE).

---

## Quick Start

### 1. Prerequisites

| Requirement | Version |
|-------------|---------|
| **Node.js** | ≥ 24 (see `.nvmrc`) |
| **pnpm** | ≥ 9 |
| **Playwright browsers** | Installed via `npx playwright install` |

### 2. Install

```bash
# Clone & install dependencies
pnpm install

# Install Playwright browsers (Chromium required)
npx playwright install chromium
```

### 3. Build

```bash
pnpm run build
```

### 4. Configure

```bash
cp ai-debug.config.example.json ai-debug.config.json
```

Edit `ai-debug.config.json` — at minimum set LLM API keys:

```jsonc
{
  "llm": {
    // Investigator — central reasoning agent (Tier 1, needs strong model)
    "investigator": {
      "provider": "openai",
      "model": "gpt-4o",
      "apiKey": "sk-..."
    },
    // Explorer + Scout — browser interaction (Tier 2, fast model preferred)
    "explorer": {
      "provider": "google",
      "model": "gemini-2.0-flash",
      "apiKey": "..."
    },
    "scout": {
      "provider": "google",
      "model": "gemini-2.0-flash",
      "apiKey": "..."
    }
  },
  "agent": {
    "mode": "autonomous",       // "autonomous" | "interactive"
    "maxIterations": 30,
    "maxRetries": 2
  },
  "browser": {
    "headless": true,
    "guardrails": {
      "allowPayment": false,    // Block payment actions
      "allowDelete": false,     // Block deletion actions
      "allowLogout": false      // Block logout actions
    }
  },
  "output": {
    "reportDir": "./debug-reports",
    "streamLevel": "summary"    // "summary" | "verbose"
  }
}
```

### 5. Environment Variables (optional)

| Variable | Purpose | Default |
|----------|---------|---------|
| `AI_DEBUG_API_KEY` | REST API auth (X-API-Key header) | None (no auth in dev) |
| `PORT` | REST API port | `3100` |
| `OPENAI_API_KEY` | Fallback API key for OpenAI models | — |
| `GOOGLE_API_KEY` | Fallback API key for Google models | — |

---

## Running

### Option A: REST API Server

```bash
# Without auth (dev mode)
pnpm run dev:api

# With auth enabled
AI_DEBUG_API_KEY="your-secret" pnpm run dev:api
```

Server starts at `http://localhost:3100`.

### Option B: MCP Server

Add to your MCP client config (Antigravity, Cursor, Claude Desktop):

```json
{
  "mcpServers": {
    "ai-debug-agent": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

Then invoke via MCP:
```
investigate_bug({ url: "https://example.com", hint: "cart crash" })
```

---

## REST API Reference

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

**Request body options:**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `url` | `string` (URL) | ✅ | — |
| `hint` | `string` | ❌ | — |
| `mode` | `"autonomous" \| "interactive"` | ❌ | `"autonomous"` |
| `callbackUrl` | `string` (URL) | ❌ | — |
| `sourcemapDir` | `string` | ❌ | — |
| `config` | `object` | ❌ | — |

### `GET /investigate/:threadId` — Poll status

```bash
curl http://localhost:3100/investigate/debug-1709500000000 \
  -H "X-API-Key: your-key"
```

**Response:**
```json
{
  "status": "done",
  "hypotheses": [...],
  "evidence": 8,
  "report": { "rootCause": "...", "severity": "high", ... }
}
```

### `GET /investigate/:threadId/stream` — SSE stream

```bash
curl http://localhost:3100/investigate/debug-1709500000000/stream \
  -H "X-API-Key: your-key"
```

Real-time `InvestigationStep` events until investigation completes.

### `GET /reports` — List reports

```bash
# All reports
curl http://localhost:3100/reports -H "X-API-Key: your-key"

# Filter by severity
curl "http://localhost:3100/reports?severity=critical" -H "X-API-Key: your-key"
```

---

## Investigation Modes

| Mode | Behavior | Use case |
|------|----------|----------|
| **`autonomous`** | Agent investigates without asking questions. Auto-assumes when context is unclear. | CI/CD, unattended |
| **`interactive`** | Agent can ask user for clarification via terminal (local) or `callbackUrl` (cloud). | Guided debugging |

**`callbackUrl`** (interactive + cloud): Agent POSTs questions to your endpoint, waits up to 5 minutes for a response:

```json
// Agent sends:
POST https://your-callback.com/questions
{ "type": "question", "question": "Does the cart require auth?" }

// Your endpoint responds:
{ "answer": "Yes, user must be logged in" }
```

---

## Report Output

Reports are saved to `./debug-reports/` as markdown files.

**Sections:**

1. **Header** — URL, severity, duration, date
2. **Root Cause** — Technical explanation
3. **Code Location** — Original file:line (via source map)
4. **Data Flow** — Component → service → API → state
5. **Suggested Fix** — Before/after code
6. **Hypotheses Investigated** — Table with status (✅/❌/⚠️) and confidence
7. **Repro Steps** — Actionable steps to reproduce
8. **Evidence** — Network, console, DOM, source observations
9. **Assumptions** — What the agent assumed (when not asked)
10. **Footer** — Agent version

---

## Using Local Models

Any server with an OpenAI-compatible API works:

| Server | `baseURL` | Install |
|--------|-----------|---------|
| **Ollama** | `http://localhost:11434/v1` | `brew install ollama && ollama pull qwen2.5:32b` |
| **LM Studio** | `http://localhost:1234/v1` | Download from lmstudio.ai |
| **vLLM** | `http://localhost:8000/v1` | `pip install vllm` |
| **llama.cpp** | `http://localhost:8080/v1` | Build from source |

```jsonc
// ai-debug.config.json — mix cloud + local
{
  "llm": {
    "investigator": {
      "provider": "openai",
      "model": "gpt-4o",
      "apiKey": "sk-..."
    },
    "explorer": {
      "provider": "ollama",
      "model": "qwen2.5:7b",
      "baseURL": "http://localhost:11434/v1",
      "apiKey": "not-needed"
    }
  }
}
```

---

## Monorepo Structure

```
ai-debug-agent/
├── shared/           Types, schemas, constants
│   ├── schemas.ts        InvestigationRequestSchema
│   ├── tool-names.ts     TOOL_NAME constants
│   ├── tool-access.ts    TOOL_ACCESS registry per agent
│   ├── bug-patterns.ts   10 bug patterns catalogue
│   └── types.ts          Barrel re-export
├── mcp-server/       MCP server + 20 tools
│   ├── browser/          Playwright wrappers (actions, dom, collector)
│   ├── sourcemap/        Source map parser (consumer, resolver)
│   └── tools/            Tool handlers (navigate, click, fill, ...)
├── mcp-client/       LangGraph graph + services
│   ├── graph/            Investigation graph (nodes, routing, state)
│   ├── agent/            LLM client, prompts, bridge, pattern-matcher
│   ├── service/          InvestigationService facade
│   └── reporter/         Report generator + registry
├── api/              Hono REST API
│   ├── routes/           /investigate, /reports
│   ├── middleware/       API key auth
│   └── repositories/    Thread repository
├── tests/            vitest tests
└── fixture-app/      Test fixture apps (placeholder)
```

---

## Tool Access Control

| Agent | Allowed Tools |
|-------|---------------|
| **Investigator** | `dispatch_browser_task`, `fetch_source_map`, `resolve_error_location`, `read_source_file`, `ask_user`, `finish_investigation` |
| **Explorer** | All browser tools + `get_console_logs`, `get_network_logs`, `get_network_payload` |
| **Scout** | `browser_navigate`, `browser_get_dom`, `browser_click`, `get_console_logs`, `get_network_logs`, `browser_screenshot` |
| **Synthesis** | None |

Enforced at runtime — `ToolAccessDeniedError` thrown if agent calls unauthorized tool.

---

## Development

```bash
pnpm run typecheck     # TypeScript type check (all packages)
pnpm run lint          # ESLint (type-aware, strict)
pnpm run test          # vitest (20 tests)
pnpm run test:watch    # vitest watch mode
pnpm run format        # Prettier format
pnpm run format:check  # Prettier check
```

**Config precedence:** `request` > `env vars` > `ai-debug.config.json` > `defaults`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Cannot find module '@ai-debug/shared'` | Run `pnpm run build` — shared package must be built first |
| `browserType.launch: Executable doesn't exist` | Run `npx playwright install chromium` |
| `401 Unauthorized` on API calls | Set `X-API-Key` header, or unset `AI_DEBUG_API_KEY` env for dev mode |
| `ECONNREFUSED` on local model | Verify model server is running (`ollama serve`, LM Studio, etc.) |
| `TypeError: fetch is not a function` | Requires Node.js ≥ 24 for native `fetch` |
| ESLint errors on test files | Test files are excluded from strict rules — run `pnpm run lint` from root |

---

## Bug Pattern Catalogue

10 built-in patterns for hypothesis seeding:

| ID | Pattern | Signals |
|----|---------|---------|
| `api-error` | API Error | 4xx/5xx, error response |
| `silent-failure` | Silent Failure | No network, no console, no UI change |
| `js-exception` | JS Exception | TypeError, ReferenceError, white screen |
| `race-condition` | Race Condition | Inconsistent, double submit, stale data |
| `state-management` | State Bug | Refresh fixes, data leaks |
| `infinite-loading` | Infinite Loading | Spinner/skeleton persists |
| `navigation` | Routing Bug | Redirect wrong, back button broken |
| `form-input` | Form Bug | Validation broken, submit does nothing |
| `file-upload` | Upload Bug | Upload no response, file rejected |
| `performance` | Performance | Slow over time, memory leak |
