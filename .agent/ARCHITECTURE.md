# AI Debug Agent — .agent Architecture

> **Project:** AI Debug Agent — Investigation Service for automated web app debugging
> **Stack:** TypeScript, LangGraph.js, MCP Protocol, Playwright, Hono, pino
> **Specs:** v4.1 — Service Architecture (MCP + REST dual interface)

---

## 📋 Overview

The `.agent` directory provides AI development assistance for building and maintaining the AI Debug Agent. It contains:
- **3 Specialist Agents** — Role-based AI personas
- **6 Skills** — Domain-specific knowledge modules
- **10 Workflows** — Slash command procedures

---

## 🏗️ Project Structure

```
ai-debug-agent/
├── api/                 # Hono REST server (POST /investigate, SSE stream)
│   ├── routes/          # investigate.ts, reports.ts
│   └── middleware/      # API key auth
├── mcp-server/          # MCP Server — browser tools + investigate_bug tool
│   ├── src/tools/       # 16 tool definitions (navigate, click, fill, get-dom, etc.)
│   ├── src/browser/     # Playwright engine + guardrails + DOM extraction + collector
│   ├── src/sourcemap/   # Fetcher, resolver, reader, tracer, fallback
│   └── src/types/
├── mcp-client/          # Investigation engine (LangGraph.js)
│   ├── src/graph/       # StateGraph + nodes (Scout, Investigator, Explorer, Synthesis)
│   ├── src/agent/       # LLM client, tool parser, config loader, prompts
│   ├── src/model/       # Model Auto-Profiler (Tier 1/2/3)
│   ├── src/auth/        # Auto-login (form + cookie)
│   ├── src/observability/ # EventBus, StepAggregator, pino logger, optional TUI
│   └── src/reporter/    # Report generation + registry (lowdb)
├── shared/              # Shared Zod schemas (InvestigationRequest, BrowserTask, etc.)
├── fixture-app/         # Integration test app with intentional bugs
├── tests/               # Unit + integration tests (Vitest)
├── specs.md             # Full project specification v4.1 (source of truth)
└── ai-debug.config.json # Runtime configuration
```

---

## 🤖 Agents (3)

| Agent | Focus | Skills Used |
|-------|-------|-------------|
| `debugger` | Root cause analysis, investigating agent pipeline issues | systematic-debugging, typescript-expert |
| `explorer-agent` | Codebase discovery, dependency mapping | systematic-debugging, typescript-expert |
| `test-engineer` | Unit tests, integration tests, fixture-app E2E | testing-patterns, webapp-testing, typescript-expert |

---

## 🧠 Skills (6)

| Skill | Description |
|-------|-------------|
| `clean-code` | Coding standards (Global) |
| `typescript-expert` | TypeScript type-level programming, performance |
| `testing-patterns` | Vitest, testing strategies, AAA pattern |
| `systematic-debugging` | 4-phase debugging methodology |
| `api-patterns` | API/protocol design (MCP tools, REST endpoints) |
| `webapp-testing` | E2E, Playwright patterns |

---

## 🔄 Workflows (10)

| Command | Description |
|---------|-------------|
| `/brainstorm` | Socratic discovery for features |
| `/debug` | Systematic debugging |
| `/plan` | Task breakdown and planning |
| `/test` | Run and create tests |
| Git workflows | Branch, commit, PR, merge, cleanup |

---

## 🔗 Quick Reference

| Need | Agent | Skills |
|------|-------|--------|
| Debug agent pipeline | `debugger` | systematic-debugging |
| Explore codebase | `explorer-agent` | typescript-expert |
| Write/run tests | `test-engineer` | testing-patterns, webapp-testing |

---

## 📖 Source of Truth

For full project specification, see [specs.md](file:///Users/mac/Documents/Corize/ai-debug-agent/specs.md).
