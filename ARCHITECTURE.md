# AI Debug Agent — Project Specifications v6.0

> **Mục tiêu:** Investigation Service nhận URL + hint (hoặc chỉ URL), tự động **điều tra bug từ đầu** — khám phá trang, thu thập evidence, resolve source map về code gốc, và đưa ra root cause + suggested fix.

> **v6.0 — từ v5.x:** Orchestrator/Worker architecture thay thế Planner/Executor. Worker nhận micro-task với **fresh context** (không kế thừa lịch sử), giải quyết context bloat. Dual interface: MCP Server + REST API.

---

## 1. Tổng quan

### 1.1 Vấn đề cần giải quyết

Developer gặp bug phải thủ công: mở browser → thao tác → đọc console → đọc network → mở DevTools Sources → tìm source map → tìm file gốc → trace flow → đoán nguyên nhân. Mất 30–60 phút cho mỗi bug.

**AI Debug Agent** thay thế toàn bộ quá trình đó. Developer chỉ cần: URL + hint.

### 1.2 Investigation Mode

|            | `interactive` (mặc định)      | `autonomous`              |
| ---------- | ----------------------------- | ------------------------- |
| Khi bị kẹt | Hỏi user, đợi trả lời         | Tự assume, ghi vào report |
| `ask_user` | Tối đa 3 lần                  | Bị disable                |
| Phù hợp    | Debug session tương tác       | CI/CD, batch run          |
| Report     | Section "User Clarifications" | Section "Assumptions"     |

### 1.3 Triết lý thiết kế

- **Investigation-first** — quan sát, thu thập evidence trước khi kết luận
- **Orchestrator/Worker split** — Orchestrator phát micro-task (model mạnh), Worker thực thi với fresh context (model nhanh)
- **Fresh context per task** — Worker không kế thừa history, tránh context bloat
- **Đào đến source** — console error chỉ là điểm bắt đầu
- **Right Model for the Right Task** — mỗi agent dùng LLM phù hợp vai trò
- **Skill-based augmentation** — dynamic skill injection dựa trên detected framework

---

## 2. Kiến trúc

### 2.1 Monorepo Structure

```
ai-debug-agent/
├── shared/          # Types, schemas, constants — zero runtime dependencies
├── mcp-server/      # MCP tools: source map analysis, orchestration
├── mcp-client/      # Core investigation logic: LangGraph, LLM, Playwright
├── api/             # Hono REST API + SQLite persistence
└── web/             # Vite + React dashboard
```

**Package dependencies:**

```
shared ← mcp-client ← mcp-server
                     ← api
                     ← web
```

### 2.2 System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         Consumers                                │
│   MCP Host (Claude/Cursor)  │  REST API Client  │  Web Dashboard │
└──────────┬──────────────────┼───────────────────┼────────────────┘
           │                  │                   │
     ┌─────▼──────┐    ┌─────▼──────┐     ┌─────▼──────┐
     │ mcp-server │    │    api/    │     │    web/    │
     │  (stdio)   │    │  (Hono)   │     │  (Vite)   │
     └─────┬──────┘    └─────┬──────┘     └────────────┘
           │                 │
           └────────┬────────┘
                    │
           ┌────────▼────────────────────────────────┐
           │              mcp-client/                 │
           │                                          │
           │   ┌───────────────────────────────────┐  │
           │   │      Investigation Graph           │  │
           │   │        (LangGraph.js)              │  │
           │   └──┬──────┬──────┬──────┬──────┬────┘  │
           │      │      │      │      │      │       │
           │  Preflight Scout Orchestrator Worker Synthesis │
           │      │      │      │      │      │       │
           │      │      │   ┌──▼──┐   │      │       │
           │      │      │   │Src  │   │      │       │
           │      │      │   │Map  │   │      │       │
           │      │      │   └─────┘   │      │       │
           └──────┼──────┼─────────────┼──────┼───────┘
                  │      │             │      │
           ┌──────▼──────▼─────────────▼──────▼───────┐
           │          @playwright/mcp                  │
           │     Browser automation (Chromium)         │
           └──────────────────────────────────────────┘
```

### 2.3 Investigation Flow

```
INPUT: URL + hint (optional)
         │
         ▼
   ┌─────────────────┐
   │  PREFLIGHT       │  Hỏi user nếu chưa có hint (interactive mode)
   └──────┬───────────┘
          │
          ▼
   ┌─────────────┐
   │    SCOUT     │  Navigate → collect baselines (DOM, console, bundles)
   └──────┬──────┘
          │
          ▼
   ┌──────────────────────────────────────────────────┐
   │           ORCHESTRATOR ↔ WORKER LOOP              │
   │                                                    │
   │  ┌────────────────────────────────────────┐       │
   │  │ ORCHESTRATOR (strategic brain)         │       │
   │  │ - Evaluate taskHistory from Workers    │       │
   │  │ - Issue micro-task via issue_task tool │       │
   │  │ - OR call source-map tools directly    │       │
   │  │ - OR call finish_investigation         │       │
   │  └──────┬────────────┬──────────┬─────────┘       │
   │         │            │          │                  │
   │    issue_task    Source map   Finish               │
   │         │            │          │                  │
   │  ┌──────▼────────┐   │    ┌─────▼──────┐         │
   │  │ WORKER         │   │    │  SYNTHESIS  │         │
   │  │ (fresh context)│   │    │  Final report│        │
   │  │ - System + task│   │    └────────────┘         │
   │  │ - Max 3 steps  │   │                            │
   │  │ - Return result│   │                            │
   │  └──────┬─────────┘   │                            │
   │         │              │                            │
   │         └──────┬───────┘                            │
   │                │                                    │
   │         Back to ORCHESTRATOR (max 10 rounds)       │
   └────────────────────────────────────────────────────┘
```

---

## 3. Graph State

```typescript
// mcp-client/src/graph/state.ts
export const AgentStateAnnotation = Annotation.Root({
  // ── Input ──────────────────────────────────────────────────
  url: Annotation<string>(),
  hint: Annotation<string | null>({ default: () => null }),
  investigationMode: Annotation<InvestigationMode>({ default: () => 'interactive' }),

  // ── Control ────────────────────────────────────────────────
  status: Annotation<InvestigationStatus>({ default: () => INVESTIGATION_STATUS.IDLE }),
  maxIterations: Annotation<number>({ default: () => 30 }),

  // ── Scout ──────────────────────────────────────────────────
  initialObservations: Annotation<ScoutObservation | null>({ default: () => null }),
  detectedFrameworks: Annotation<string[]>({ default: () => [] }),
  activeSkills: Annotation<string[]>({ default: () => [] }),

  // ── Orchestrator/Worker ───────────────────────────────────
  microTask: Annotation<string | null>({ default: () => null }),
  orchestratorRound: Annotation<number>({ default: () => 0 }),
  taskHistory: Annotation<string[]>({ default: () => [] }),

  // ── Evidence ───────────────────────────────────────────────
  hypotheses: Annotation<Hypothesis[]>({ default: () => [] }),
  evidence: Annotation<Evidence[]>({ default: () => [] }),
  assumptions: Annotation<string[]>({ default: () => [] }),

  // ── Source Analysis ────────────────────────────────────────
  codeAnalysis: Annotation<CodeAnalysis | null>({ default: () => null }),

  // ── User Interaction ───────────────────────────────────────
  pendingQuestion: Annotation<string | null>({ default: () => null }),
  userClarifications: Annotation<UserClarification[]>({ default: () => [] }),

  // ── Timing ─────────────────────────────────────────────────
  startTime: Annotation<number>({ default: () => Date.now() }),

  // ── Output ─────────────────────────────────────────────────
  finalReport: Annotation<InvestigationReport | null>,
});
```

---

## 4. Graph Nodes

### 4.0 Preflight Node

Kiểm tra hint. Nếu thiếu: interactive mode → hỏi user; autonomous mode → dùng default hint.

| Có hint? | Mode          | Hành vi                                 |
| -------- | ------------- | --------------------------------------- |
| ✅       | bất kỳ        | Proceed → Scout                         |
| ❌       | `interactive` | Hỏi user → đợi → Scout                  |
| ❌       | `autonomous`  | Default "general investigation" → Scout |

### 4.1 Scout Node

Chạy **một lần** đầu tiên. Navigate tới URL, collect baselines:

- DOM snapshot (accessibility tree via `browser_snapshot`)
- Console messages (`browser_console_messages`)
- Page title, framework detection
- Bundle URLs (cho source map)
- Parsed stack traces từ console errors

Emit: `ScoutObservation` + initial `Evidence[]` + `detectedFrameworks` + `activeSkills`

### 4.2 Orchestrator Node

**Strategic brain.** Nhận full state, đánh giá taskHistory, phát micro-task cho Worker.

**Khác biệt so với Planner cũ:**

| Planner (v5)                  | Orchestrator (v6)                       |
| ----------------------------- | --------------------------------------- |
| Viết investigation brief dài  | Phát micro-task ngắn, cụ thể            |
| Max 3 rounds                  | Max 10 rounds                           |
| Executor kế thừa full context | Worker nhận fresh context (system+task) |

**Decision flow:**

1. Round 1 (after Scout): Phát micro-task dựa trên hint + scout observations
2. Round 2+ (after Worker): Đánh giá taskHistory → issue_task mới / source map / finish
3. **Max 10 rounds** — round 10 bắt buộc `finish_investigation`

**Tools:** `issue_task`, `fetch_source_map`, `resolve_error_location`, `read_source_file`, `ask_user`, `finish_investigation`

### 4.3 Worker Node

**Stateless browser executor.** Nhận micro-task từ Orchestrator, thực thi với **fresh context**.

**Key design (Antigravity-inspired):**

- **Fresh context** — chỉ nhận system prompt + micro-task, không kế thừa history
- **Max 3 tool calls** — ngắn gọn, tránh hallucination
- **Return kết quả** → Orchestrator đánh giá và phát task tiếp

**Tools (Browser only):** `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_fill`, `browser_hover`, `browser_select`, `browser_scroll`, `browser_take_screenshot`, `browser_console_messages`, `get_network_logs`, `get_network_payload`, etc.

### 4.4 Validator Node

Kiểm tra chất lượng evidence trước khi synthesis:

- `taskHistory.length === 0` → force one more round
- Evidence quá mỏng → quay lại Orchestrator

### 4.5 Source Map Node

Resolve minified error locations về source gốc. Ưu tiên parsed stack trace frames (real line:col), fallback sang legacy bundleUrl scan (line:1 col:0).

### 4.6 Ask User Node

Interactive clarification. Chỉ chạy khi `pendingQuestion` !== null. Gọi `promptUser()` rồi trả `userClarifications`.

### 4.7 Synthesis Node

Generate final `InvestigationReport` từ all collected evidence. Có anti-hallucination rules:

- Dùng EXACT error messages — copy verbatim
- NEVER fabricate file/function names
- Distinguish OBSERVED vs INFERRED

Hỗ trợ vision models (screenshots trong context).

---

## 5. Routing

```typescript
// graph/routing.ts
preflight → scout (hint OK) | ask_user (needs hint)
scout → orchestrator
orchestrator → worker (issue_task)
            | source_map (status = SOURCE_ANALYSIS)
            | synthesis (status = SYNTHESIZING)
            | force_synthesis (orchestratorRound >= 10)
worker → orchestrator (always)
source_map → orchestrator
ask_user → orchestrator | scout (from preflight)
validator → orchestrator (needs more) | synthesis (sufficient)
synthesis → END
```

---

## 6. Tool Access Control

```typescript
// shared/tool-access.ts
orchestrator: [issue_task, fetch_source_map, resolve_error_location, read_source_file,
               ask_user, finish_investigation]
worker:       [browser_navigate, browser_snapshot, browser_click, browser_fill,
               browser_hover, browser_select, browser_scroll, browser_take_screenshot,
               browser_console_messages, get_network_logs, get_network_payload, ...]
scout:        [browser_navigate, browser_snapshot, browser_click,
               browser_console_messages, get_network_logs, browser_take_screenshot]
synthesis:    [] // no tools — LLM generation only
```

---

## 7. Skill System

Skills are `.skill.md` files with YAML frontmatter + markdown instructions.

```yaml
---
id: api-error
name: API Error
category: bug-pattern
detectionSignals: [network 4xx, network 5xx]
priority: 90
alwaysActive: false
---
# Investigation instructions (injected into agent prompt)
```

**Detection flow:**

1. Scout collects signals (console errors, network errors, DOM observations, frameworks)
2. `SkillRegistry.resolveSkills()` matches signals against skill `detectionSignals`
3. Matched skill IDs stored in `state.activeSkills`
4. Skill instructions injected into Orchestrator + Worker + Synthesis prompts

**`alwaysActive` skills:** Injected regardless of signal matching (e.g., `dev-report`)

---

## 8. Config

3-layer: file → request override → defaults.

```jsonc
// ai-debug.config.json
{
  "llm": {
    "default": {
      "provider": "openai",
      "baseURL": "...",
      "model": "gpt-4o",
      "apiKey": "$OPENAI_API_KEY",
    },
    "orchestrator": {
      /* Strategic brain — strong model recommended */
    },
    "worker": {
      /* Browser executor — fast model OK */
    },
    "scout": {
      /* optional override */
    },
  },
  "agent": { "maxIterations": 30, "mode": "interactive" },
  "browser": { "headless": true },
  "output": { "reportsDir": "./debug-reports" },
}
```

> **Backward compat:** Config keys `investigator`/`explorer` still work — mapped to orchestrator/worker via `AGENT_ROLE_MAP` in `llm-client.ts`.

---

## 9. Service Architecture

### 9.1 Dual Interface

| Interface  | Entry Point            | Transport  |
| ---------- | ---------------------- | ---------- |
| MCP Server | `investigate_bug` tool | stdio      |
| REST API   | `POST /investigate`    | HTTP + SSE |

### 9.2 REST API

```
GET  /              → { service, version }
GET  /health        → { status, uptime }
POST /investigate   → Start investigation (SSE stream)
GET  /reports       → List reports
GET  /reports/:id   → Get report
```

### 9.3 Observability

`EventBus` emits typed events: `reasoning`, `tool_call`, `tool_result`, `error`, `phase_change`, `screenshot_captured`, `sourcemap_resolved`, `llm_usage`.

Investigation logs saved to `debug-reports/` as markdown files.

---

## 10. Key Types

```typescript
// ── shared/domain.ts ────────────────────────────────────────
type ScoutObservation = {
  url: string;
  pageTitle: string;
  consoleErrors: string[];
  parsedErrors: ParsedError[];
  networkErrors: NetworkError[];
  suspiciousPatterns: string[];
  domSnapshot: string;
  bundleUrls: string[];
  interactiveElements: string[];
  timestamp: string;
};

type InvestigationReport = {
  summary: string;
  rootCause: string;
  codeLocation: SourceMapResolution | null;
  dataFlow: string;
  suggestedFix: {
    file: string;
    line: number;
    before: string;
    after: string;
    explanation: string;
  } | null;
  reproSteps: string[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  severity: ReportSeverity;
  cannotDetermine: boolean;
  assumptions: string[];
  timestamp: string;
  url: string;
  durationMs: number;
};

type ReportSeverity = 'critical' | 'high' | 'medium' | 'low';

// ── shared/schemas.ts ───────────────────────────────────────
// InvestigationRequestSchema: { url, hint?, mode?, callbackUrl?, config? }
// FinishInvestigationSchema: { rootCause, severity, confidence, reproSteps, ... }
```
