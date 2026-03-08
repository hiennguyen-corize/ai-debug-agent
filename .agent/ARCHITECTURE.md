# AI Debug Agent — .agent Architecture

> **Project:** AI Debug Agent — Investigation Service for automated web app debugging
> **Stack:** TypeScript, LangGraph.js, Playwright MCP, Hono, Drizzle ORM, pino
> **Specs:** v7.2 — Single Agent Loop + LangGraph orchestration

---

## 📋 Overview

The `.agent` directory provides AI development assistance for building and maintaining the AI Debug Agent. It contains:

- **3 Specialist Agents** — Role-based AI personas
- **9 Skills** — Domain-specific knowledge modules
- **10 Workflows** — Slash command procedures

---

## 🏗️ Project Structure

```
ai-debug-agent/
├── api/                 # Hono REST server (POST /investigate, SSE stream)
│   ├── routes/          # investigate.ts, reports.ts
│   ├── middleware/      # API key auth
│   ├── repositories/   # Thread + artifact repositories
│   └── db/             # SQLite schema (Drizzle ORM)
├── engine/              # Core investigation engine
│   ├── src/agent/       # LangGraph graph, LLM client, config, prompts, tools
│   │   ├── graph/       # StateGraph nodes, state, tool-dispatch, helpers
│   │   ├── loop/        # Tool definitions, normalize, snapshot-summarizer
│   │   └── tools/       # Source map tools, fetch-js-snippet
│   ├── src/sourcemap/   # Source map parser (consumer, resolver)
│   ├── src/service/     # InvestigationService facade
│   └── src/observability/ # EventBus, logger, token tracking
├── shared/              # Types, schemas, constants
├── web/                 # Vite + React dashboard
├── tests/               # Unit + integration tests (Vitest)
└── ai-debug.config.json # Runtime configuration
```

---

## 🤖 Agents (3)

| Agent            | Focus                                                    | Skills Used                                         |
| ---------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `debugger`       | Root cause analysis, investigating agent pipeline issues | systematic-debugging, typescript-expert             |
| `explorer-agent` | Codebase discovery, dependency mapping                   | systematic-debugging, typescript-expert             |
| `test-engineer`  | Unit tests, integration tests, fixture-app E2E           | testing-patterns, webapp-testing, typescript-expert |

---

## 🧠 Skills (9)

| Skill                         | Description                                     |
| ----------------------------- | ----------------------------------------------- |
| `clean-code`                  | Coding standards (Global)                       |
| `typescript-expert`           | TypeScript type-level programming, performance  |
| `testing-patterns`            | Vitest, testing strategies, AAA pattern         |
| `systematic-debugging`        | 4-phase debugging methodology                   |
| `api-patterns`                | API/protocol design (MCP tools, REST endpoints) |
| `webapp-testing`              | E2E, Playwright patterns                        |
| `browser-automation`          | Browser testing, design-to-code, visual debug   |
| `monorepo-architect`          | Monorepo setup, build systems, Nx/Turborepo     |
| `vercel-react-best-practices` | React/Next.js performance optimization          |

---

## 🔄 Workflows (10)

| Command       | Description                        |
| ------------- | ---------------------------------- |
| `/brainstorm` | Socratic discovery for features    |
| `/debug`      | Systematic debugging               |
| `/plan`       | Task breakdown and planning        |
| `/test`       | Run and create tests               |
| Git workflows | Branch, commit, PR, merge, cleanup |

---

## 🔗 Quick Reference

| Need                 | Agent            | Skills                           |
| -------------------- | ---------------- | -------------------------------- |
| Debug agent pipeline | `debugger`       | systematic-debugging             |
| Explore codebase     | `explorer-agent` | typescript-expert                |
| Write/run tests      | `test-engineer`  | testing-patterns, webapp-testing |

---

## 📖 Source of Truth

For full project specification, see [ARCHITECTURE.md](file:///c:/Users/PC/Works/Personal/ai-debug-agent/ARCHITECTURE.md).
