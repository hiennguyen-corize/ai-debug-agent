# AI Debug Agent — .agent Architecture

> **Project:** AI Debug Agent — CLI tool for automated web app debugging
> **Stack:** TypeScript, LangGraph.js, MCP Protocol, Playwright, ink

---

## 📋 Overview

The `.agent` directory provides AI development assistance for building and maintaining the AI Debug Agent tool. It contains:
- **3 Specialist Agents** — Role-based AI personas
- **6 Skills** — Domain-specific knowledge modules
- **10 Workflows** — Slash command procedures

---

## 🏗️ Project Structure

```
ai-debug-agent/
├── mcp-server/          # MCP Server — browser tools via stdio
│   ├── src/tools/       # 12 tool definitions (navigate, click, fill, etc.)
│   ├── src/browser/     # Playwright engine + guardrails + DOM extraction
│   └── src/types/
├── mcp-client/          # Multi-Agent orchestration
│   ├── src/graph/       # LangGraph StateGraph + nodes
│   ├── src/agents/      # Explorer, Analyzer, Reporter agents
│   ├── src/agent/       # LLM client, tool parser, prompts
│   ├── src/model/       # Model Auto-Profiler
│   ├── src/auth/        # Auto-login
│   ├── src/observability/ # TUI dashboard, EventBus, JSONL logger
│   └── src/reporter/    # Report generation
├── shared/              # Shared Zod schemas
├── fixture-app/         # Integration test app with intentional bugs
├── specs.md             # Full project specification (source of truth)
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
| `api-patterns` | API/protocol design (MCP tools) |
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
