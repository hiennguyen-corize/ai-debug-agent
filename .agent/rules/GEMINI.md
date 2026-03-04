# GEMINI.md — AI Debug Agent Configuration

> **Version 1.0** — AI Debug Agent Development Rules
> This file defines how the AI behaves in this workspace.

---

## 🔴 CRITICAL: AGENT & SKILL PROTOCOL (START HERE)

> **MANDATORY:** You MUST read the appropriate agent file and its skills BEFORE performing any implementation.

### 1. Modular Skill Loading Protocol
```
Agent activated → Check frontmatter "skills:" field
    │
    └── For EACH skill:
        ├── Read SKILL.md (INDEX only)
        ├── Find relevant sections from content map
        └── Read ONLY those section files
```

- **Rule Priority:** P0 (GEMINI.md) > P1 (Agent .md) > P2 (SKILL.md). All rules are binding.

### 2. Enforcement Protocol
1. **When agent is activated:**
   - ✅ READ all rules inside the agent file.
   - ✅ CHECK frontmatter `skills:` list.
   - ✅ LOAD each skill's `SKILL.md`.
   - ✅ APPLY all rules from agent AND skills.

---

## 📥 REQUEST CLASSIFIER

**Before ANY action, classify the request:**

| Request Type | Trigger Keywords | Result |
|--------------|------------------|--------|
| **QUESTION** | "what is", "how does", "explain" | Text Response |
| **SURVEY/INTEL** | "analyze", "list files", "overview" | Session Intel |
| **SIMPLE CODE** | "fix", "add", "change" (single file) | Inline Edit |
| **COMPLEX CODE** | "build", "create", "implement", "refactor" | **{task-slug}.md Required** |
| **SLASH CMD** | /debug, /test, /plan, /brainstorm | Command-specific flow |

---

## TIER 0: UNIVERSAL RULES (Always Active)

### 🌐 Language Handling

When user's prompt is NOT in English:
1. **Internally translate** for better comprehension
2. **Respond in user's language** — match their communication
3. **Code comments/variables** remain in English

### 🧹 Clean Code (Global Mandatory)

**ALL code MUST follow `@[skills/clean-code]` rules. No exceptions.**

- Concise, direct, solution-focused
- No verbose explanations or over-commenting
- No over-engineering
- **Self-Documentation:** Document changes in relevant `.md` files
- **Testing Mandate:** Write and run tests (AAA pattern)
- **No `eslint-disable` Band-Aids:** Fix root cause, not symptoms. Research the SDK/library types before suppressing. `eslint-disable` is only acceptable when the root cause is genuinely unfixable (e.g. Playwright `evaluate()` browser context types, OpenAI SDK runtime nullability)

### 📁 File Dependency Awareness

**Before modifying ANY file:**
1. Understand the module boundary (mcp-server vs mcp-client vs shared)
2. Identify dependent files across packages
3. Update ALL affected files together

### 🗺️ System Map Read

> 🔴 **MANDATORY:** Read `ARCHITECTURE.md` and `specs.md` at session start.

**Key paths:**
- Agents: `.agent/agents/`
- Skills: `.agent/skills/`
- Workflows: `.agent/workflows/`
- Full specs: `specs.md`

### 🧠 Read → Understand → Apply

```
❌ WRONG: Read specs → Start coding
✅ CORRECT: Read → Understand architecture → Apply patterns → Code
```

---

## TIER 1: CODE RULES (When Writing Code)

### 📦 Import Rules

**Use `#` subpath imports. NEVER use relative `../` paths.**

```typescript
// ❌ WRONG
import { getPage } from '../browser/browser.js';
import type { EventBus } from '../../observability/event-bus.js';

// ✅ CORRECT
import { getPage } from '#browser/browser.js';
import type { EventBus } from '#observability/event-bus.js';
```

- Subpath mappings defined in each package's `package.json` `"imports"` field
- TypeScript resolution via `tsconfig.json` `"paths"`
- Same-directory `./` imports are fine

### 📱 Project Type Routing

| Project Type | Primary Agent | Skills |
|--------------|---------------|--------|
| **Service/Agent Logic** | `debugger` | systematic-debugging, typescript-expert |
| **MCP Server/Tools** | `explorer-agent` + `debugger` | api-patterns, typescript-expert |
| **REST API (Hono)** | `debugger` | api-patterns, typescript-expert |
| **Tests** | `test-engineer` | testing-patterns, webapp-testing |

### 🛑 Socratic Gate

**For complex requests, STOP and ASK first:**

| Request Type | Strategy |
|--------------|----------|
| **New Feature / Build** | ASK minimum 2 questions about scope and edge cases |
| **Code Edit / Bug Fix** | Confirm understanding of the bug and its context |
| **Vague / Simple** | Ask for Purpose and Scope |

### 🚫 Git Workflow Rules

**CRITICAL: Branch Protection**

| Rule | Status | Reason |
|------|--------|--------|
| **Force Push** | ❌ **FORBIDDEN** | Rewrites history |
| **Regular Push** | ✅ Allowed | Safe |
| **Rebase (local)** | ✅ Allowed | Before first push only |

**Commit Format:** `<type>: <description>` — Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

**Branch Naming:** `<type>/<description>` — e.g., `feature/mcp-server-tools`

---

## 📁 QUICK REFERENCE

### Available Agents (3)

| Agent | Domain & Focus |
|-------|----------------|
| `debugger` | Root cause analysis, agent pipeline investigation |
| `explorer-agent` | Codebase discovery, dependency mapping |
| `test-engineer` | Unit tests, integration tests, fixture-app E2E |

### Key Skills (6)

| Skill | Purpose |
|-------|---------|
| `clean-code` | Coding standards (GLOBAL) |
| `typescript-expert` | TypeScript type-level programming |
| `testing-patterns` | Vitest, testing strategies |
| `systematic-debugging` | 4-phase debugging methodology |
| `api-patterns` | MCP protocol / API design |
| `webapp-testing` | E2E, Playwright patterns |

---