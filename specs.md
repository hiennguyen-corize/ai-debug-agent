# AI Debug Agent — Project Specifications v4.1

> **Mục tiêu:** Investigation Service (deploy local hoặc cloud), nhận request qua **MCP tool** hoặc **REST API** với URL + mô tả bug (hoặc chỉ URL), tự động **điều tra từ đầu** như một senior developer — khám phá trang, xây dựng hypothesis, tái hiện bug, resolve source map về code gốc, trace data flow, và đưa ra root cause + suggested fix cụ thể trong code.

> **Thay đổi triết lý v4.0:** v3.x là _"reproduce bug theo instruction"_. v4.0 là _"tự điều tra bug từ đầu"_ — agent không cần biết bug là gì trước khi bắt đầu. Investigation-first, không phải script-first.
>
> **Changelog v4.0.1:** Thêm Investigation Mode — `interactive` (mặc định, hỏi user khi bị kẹt) và `autonomous` (tự assume mọi thứ, không bao giờ interrupt, phù hợp CI/CD hoặc batch run).
>
> **Changelog v4.0.2:** Gap fixes — (1) Pre-flight clarification; (2) Import chain tracing; (3) Source map fallback strategy; (4) Bug Pattern Catalogue.
>
> **Changelog v4.0.3:** Khôi phục Antigravity Browser Subagent pattern — Investigator (Tier 1) chỉ suy luận và viết `BrowserTask`, Explorer (Tier 2) nhận task và thực thi browser actions one-shot qua `ReusedSubagentId`. Tách tool set thành hai nhóm rõ ràng: Analysis Tools (Investigator) và Browser Tools (Explorer).
>
> **Changelog v4.1.1:** SRP refactoring — extracted `explorer-tools.ts`, `investigator-tools.ts`, `tool-call-tracker.ts`, `evidence.ts`, `dom-parser.ts`. Centralized all message builders in `prompts.ts`. Explorer 264→113 lines, Investigator 317→156 lines. Removed fixture-app.
> **Changelog v4.1:** Service Architecture — chuyển từ CLI tool sang Investigation Service. Dual interface: MCP Server (tool `investigate_bug`) + REST API (`POST /investigate`). EventBus streaming qua SSE cho remote consumers. `ask_user` hỗ trợ `callbackUrl` cho cloud deployment. ink TUI trở thành optional (local dev only).

---

## 1. Tổng quan

### 1.1 Vấn đề cần giải quyết

Developer gặp bug phải thủ công: mở browser → thao tác → đọc console → đọc network → mở DevTools Sources → tìm source map → đọc code minified → tìm file gốc → trace flow → đoán nguyên nhân. Context switching liên tục, mất 30–60 phút cho mỗi bug không rõ nguyên nhân.

**AI Debug Agent v4.0** thay thế toàn bộ quá trình đó. Developer chỉ cần: URL + mô tả ngắn (hoặc chỉ URL). Agent tự làm phần còn lại — bao gồm cả việc đọc source code gốc sau khi resolve source map.

### 1.2 Sự khác biệt so với v3.x

|                | v3.x                         | v4.0                                           |
| -------------- | ---------------------------- | ---------------------------------------------- |
| Input          | URL + mô tả bug rõ ràng      | URL + hint (hoặc chỉ URL)                      |
| Starting point | Agent biết cần reproduce gì  | Agent không biết gì — tự khám phá              |
| Loop chính     | Reproduce loop               | Investigation loop — hypothesis-driven         |
| Depth          | Dừng ở network/console error | Đào xuống source map → code gốc → data flow    |
| Khi bị kẹt     | Tự assume                    | **Mode-dependent** (xem bên dưới)              |
| Output         | Bug report + evidence        | Bug report + **code location + suggested fix** |

### 1.3 Investigation Mode

Hai mode điều khiển behavior khi Investigator thiếu thông tin:

|                        | `interactive` (mặc định)                            | `autonomous`                               |
| ---------------------- | --------------------------------------------------- | ------------------------------------------ |
| Khi bị kẹt             | Hỏi user qua terminal, đợi trả lời                  | Tự đưa ra assumption, ghi vào report       |
| `ask_user` tool        | Được phép, tối đa 3 lần                             | Bị disable hoàn toàn                       |
| Phù hợp                | Debug session tương tác, context nghiệp vụ phức tạp | CI/CD, batch run, không có người ngồi chờ  |
| Report                 | Có section "User Clarifications"                    | Có section "Assumptions" nhiều hơn         |
| Kết quả khi không chắc | Dừng, hỏi → kết quả chính xác hơn                   | Tiếp tục với assumption → có thể sai hướng |

**Lưu ý:** `autonomous` không có nghĩa là kém hơn — với bug có đủ evidence từ network/console/source map, cả hai mode cho kết quả như nhau. Sự khác biệt chỉ xuất hiện khi agent thực sự bị kẹt vì thiếu business context.

### 1.4 Triết lý thiết kế

- **Investigation-first** — vào trang, quan sát, xây hypothesis trước khi làm bất cứ điều gì
- **Hypothesis-driven loop** — mỗi action là để test một hypothesis cụ thể, không phải execute script
- **Đào đến source** — console error chỉ là điểm bắt đầu, không phải điểm kết thúc
- **Interrupt khi cần** — hỏi user khi thực sự bị kẹt, không assume sai rồi đi sai hướng
- **Right Model for the Right Task** — Investigator cần model mạnh nhất, Executor chỉ cần nhanh
- **Zero magic numbers** — mọi thông số từ config hoặc Profiler
- **Prefer libraries over reinvention** — không tự viết những gì có thư viện tốt hơn

---

## 2. Kiến trúc tổng thể

### 2.1 Sơ đồ hệ thống

```
┌─────────────────────────────────────────────────────────────┐
│                        Developer                            │
│   ai-debug run --url "https://shop.com/cart"                │
│                  --hint "thêm vào giỏ hàng bị crash"        │
└────────────────────────┬────────────────────────────────────┘
                         │
             ┌───────────▼──────────────────────┐
             │          mcp-client/             │
             │                                  │
             │  ┌───────────────────────────┐   │
             │  │     Investigation Graph   │   │
             │  │      (LangGraph.js)       │   │
             │  └──┬───────┬──────┬─────┬───┘   │
             │     │       │      │     │        │
             │  ┌──▼──┐ ┌──▼───┐ ┌▼──┐ ┌▼─────┐ │
             │  │Scout│ │Invest│ │Src│ │Synth │ │
             │  │Node │ │igator│ │Map│ │esis  │ │
             │  │     │ │Node  │ │   │ │Node  │ │
             │  └──┬──┘ └──┬───┘ └┬──┘ └┬─────┘ │
             │     │  BrowserTask │      │        │
             │     │       │      │      │        │
             │     │    ┌──▼────────┐    │        │
             │     │    │  Explorer  │   │        │
             │     │    │  Subagent  │   │        │
             │     │    │(Antigravity│   │        │
             │     │    │ pattern)   │   │        │
             │     │    └──────┬─────┘   │        │
             └─────┼───────────┼─────────┼────────┘
                   │           │         │
             ┌─────▼───────────▼─────────▼────────┐
             │           mcp-server/              │
             │                                    │
             │  Browser Tools  │  Analysis Tools  │
             │  (Playwright)   │  (Source Map)    │
             └────────────────────────────────────┘
```

### 2.2 Investigation Flow — Tổng quan

```
INPUT: URL + hint (optional)
         │
         ▼
   ┌─────────────────────┐
   │ PRE-FLIGHT NODE      │  ← MỚI v4.0.2 — hỏi user bị bug gì nếu chưa có hint
   └──────┬──────────────┘    (chỉ ở interactive mode; autonomous bỏ qua)
          │ hint confirmed / assumed
          ▼
   ┌─────────────┐
   │ SCOUT PHASE │  ← Vào trang, quan sát baseline không cần biết bug gì
   └──────┬──────┘
          │ initial_observations: console errors, network anomalies, DOM state
          ▼
   ┌──────────────────┐
   │ HYPOTHESIS PHASE │  ← Xây 1–3 hypothesis từ observations
   └──────┬───────────┘
          │ hypotheses: [{id, statement, confidence, test_strategy}]
          ▼
   ┌──────────────────────────────────────────────────────┐
   │                INVESTIGATION LOOP                    │
   │                                                      │
   │  ┌─────────────────────────────────────────────┐    │
   │  │ INVESTIGATOR (Tier 1)                        │    │
   │  │ Pick highest-confidence untested hypothesis  │    │
   │  │ Decide action type                           │    │
   │  └──────┬──────────────────┬───────────────────┘    │
   │         │                  │                         │
   │  ┌──────▼──────┐   ┌───────▼──────────────────┐     │
   │  │Browser Action│  │  Analysis Action          │     │
   │  │              │  │  fetch_sourcemap           │     │
   │  │ Write        │  │  read_source               │     │
   │  │ BrowserTask  │  │  ask_user                  │     │
   │  └──────┬───────┘  └───────┬──────────────────┘     │
   │         │                  │                         │
   │  ┌──────▼──────────────┐   │                         │
   │  │ EXPLORER (Tier 2)   │   │                         │
   │  │ Subagent — one-shot │   │                         │
   │  │ ReusedSubagentId    │   │                         │
   │  │ thực thi BrowserTask│   │                         │
   │  │ báo cáo kết quả     │   │                         │
   │  └──────┬──────────────┘   │                         │
   │         └────────┬─────────┘                         │
   │                  │                                    │
   │        ┌─────────▼──────────────────────┐            │
   │        │  INVESTIGATOR đánh giá kết quả │            │
   │        │  - Confirmed → source analysis │            │
   │        │  - Refuted   → next hypothesis │            │
   │        │  - Partial   → refine + retest │            │
   │        └─────────┬──────────────────────┘            │
   │                  │                                    │
   │        ┌─────────▼─────────────────────┐             │
   │        │  Enough evidence?             │             │
   │        └─────────┬─────────────────────┘             │
   │                  │                                    │
   │            NO ───┘  YES ──► EXIT LOOP                │
   └──────────────────────────────────────────────────────┘
          │
          ▼
   ┌──────────────┐
   │ SOURCE PHASE │  ← Resolve source map, đọc code gốc, trace data flow
   └──────┬───────┘
          │ code_location: { file, line, snippet, data_flow }
          ▼
   ┌────────────────┐
   │ SYNTHESIS PHASE│  ← Root cause + suggested fix trong code
   └────────────────┘
```

---

## 3. LangGraph State

```typescript
// graph/state.ts
export const StateAnnotation = Annotation.Root({
  // ── Config ─────────────────────────────────────────────────
  investigationMode: Annotation<'interactive' | 'autonomous'>({
    default: () => 'interactive',
  }),

  // ── Input ──────────────────────────────────────────────────
  url: Annotation<string>(),
  hint: Annotation<string>({ default: () => '' }), // có thể rỗng
  baseUrl: Annotation<string>(),

  // ── Scout observations ─────────────────────────────────────
  initialObservations: Annotation<ScoutObservation | null>({
    default: () => null,
  }),

  // ── Hypotheses ─────────────────────────────────────────────
  hypotheses: Annotation<Hypothesis[]>({
    default: () => [],
    reducer: (prev, next) => mergeHypotheses(prev, next),
    // mergeHypotheses: upsert by id, update confidence
  }),

  // ── Investigation evidence ─────────────────────────────────
  evidence: Annotation<Evidence[]>({
    default: () => [],
    reducer: (prev, next) => [...prev, ...next],
  }),

  // ── Source analysis ────────────────────────────────────────
  sourceMapResolutions: Annotation<SourceMapResolution[]>({
    default: () => [],
    reducer: (prev, next) => [...prev, ...next],
  }),
  codeAnalysis: Annotation<CodeAnalysis | null>({ default: () => null }),

  // ── User interaction ───────────────────────────────────────
  userClarifications: Annotation<UserClarification[]>({
    default: () => [],
    reducer: (prev, next) => [...prev, ...next],
  }),
  pendingQuestion: Annotation<string | null>({ default: () => null }),

  // ── Browser session ────────────────────────────────────────
  currentSessionId: Annotation<string>({ default: () => '' }),
  isAuthenticated: Annotation<boolean>({ default: () => false }),
  explorerSubagentId: Annotation<string>({ default: () => `explorer-${Date.now()}` }),
  // ↑ ReusedSubagentId — cố định suốt session để Explorer giữ browser state

  // ── Browser task dispatch ───────────────────────────────────
  pendingBrowserTask: Annotation<BrowserTask | null>({
    default: () => null,
  }),

  // ── Browser task results ────────────────────────────────────
  browserTaskResults: Annotation<BrowserTaskResult[]>({
    default: () => [],
    reducer: (prev, next) => [...prev, ...next],
  }),

  // ── Control ────────────────────────────────────────────────
  iterationCount: Annotation<number>({ default: () => 0 }),
  maxIterations: Annotation<number>({ default: () => 30 }),
  status: Annotation<
    | 'scouting'
    | 'hypothesizing'
    | 'investigating'
    | 'waiting_explorer'
    | 'source_analysis'
    | 'synthesizing'
    | 'done'
    | 'needs_user_input'
    | 'cannot_determine'
  >({ default: () => 'scouting' }),

  // ── Final output ───────────────────────────────────────────
  finalReport: Annotation<InvestigationReport | null>({ default: () => null }),
});
```

### 3.1 Core Types

```typescript
// shared/types.ts

interface ScoutObservation {
  url: string;
  pageTitle: string;
  consoleErrors: string[];
  networkErrors: NetworkError[];
  suspiciousPatterns: string[]; // vd: "spinner không biến mất", "empty state không expected"
  domSnapshot: string; // text summary của DOM
  bundleUrls: string[]; // URLs của JS bundles — để fetch source map sau
  timestamp: string;
}

interface Hypothesis {
  id: string; // "h1", "h2", "h3"
  statement: string; // "API /api/cart/add đang trả về lỗi"
  confidence: number; // 0.0 – 1.0
  status: 'untested' | 'testing' | 'confirmed' | 'refuted' | 'partial';
  evidence_ids: string[]; // ID của evidence liên quan
  test_strategy: string; // "Navigate to cart page, click Add to Cart, observe network"
}

interface Evidence {
  id: string;
  type:
    | 'console_error'
    | 'network_error'
    | 'network_payload'
    | 'dom_state'
    | 'source_code'
    | 'user_input'
    | 'screenshot';
  content: string;
  timestamp: string;
  hypothesis_id?: string; // hypothesis nào evidence này test
}

interface SourceMapResolution {
  bundleUrl: string; // "https://shop.com/static/js/main.abc123.js"
  sourceMapUrl: string; // "main.abc123.js.map" hoặc local path
  sourceMapOrigin: 'public' | 'local';
  originalFile: string; // "src/features/cart/CartService.ts"
  originalLine: number;
  originalColumn: number;
  codeSnippet: string; // 10 dòng xung quanh điểm lỗi
}

interface CodeAnalysis {
  errorLocation: SourceMapResolution;
  dataFlow: {
    uiComponent: string; // "AddToCartButton.tsx:handleClick()"
    apiCall: string; // "CartService.ts:addItem() → POST /api/cart/add"
    stateUpdate: string; // "cartSlice.ts:addItemFulfilled() → không được gọi"
    rootCause: string; // mô tả kỹ thuật chính xác
  };
  suggestedFix: {
    file: string;
    line: number;
    before: string; // code hiện tại
    after: string; // code suggested
    explanation: string;
  };
}

interface UserClarification {
  question: string;
  answer: string;
  timestamp: string;
}

// ── Antigravity pattern ────────────────────────────────────
interface BrowserTask {
  task: string; // mô tả đầy đủ, self-contained — Explorer không có context nào khác
  subagentId: string; // ReusedSubagentId — dùng lại browser session, giữ cookies/auth
  stopCondition: string; // "Return khi thấy network request đến /api/cart/add"
  collectEvidence: string[]; // ["console_errors", "network_logs", "screenshot", "dom_state"]
  hypothesis_id: string; // để Investigator map kết quả về đúng hypothesis
  timeoutMs: number; // từ Profiler theo Tier
}

interface BrowserTaskResult {
  subagentId: string;
  hypothesis_id: string;
  consoleErrors: string[];
  networkLogs: NetworkLog[];
  screenshot: string | null; // base64
  domSnapshot: string | null;
  taskCompleted: boolean;
  stopConditionMet: boolean;
  summary: string; // Explorer tóm tắt những gì quan sát được
}

interface InvestigationReport {
  summary: string;
  rootCause: string;
  codeLocation: SourceMapResolution | null;
  dataFlow: string;
  suggestedFix: CodeAnalysis['suggestedFix'] | null;
  reproSteps: string[];
  evidence: Evidence[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  cannotDetermine?: boolean;
  assumptions: string[]; // những gì agent assume trong quá trình điều tra
}
```

---

## 4. Graph Nodes

### 4.0 Pre-flight Node _(MỚI v4.0.2)_

**Chạy đầu tiên, trước Scout.** Kiểm tra xem agent đã có đủ context để bắt đầu điều tra chưa. Nếu user không cung cấp hint, node này hỏi một câu duy nhất để Scout biết nên focus vào đâu — tránh việc Scout collect noise từ toàn bộ trang.

```typescript
// graph/nodes/preflight.ts
async function preflightNode(state: AgentState): Promise<Partial<AgentState>> {
  // Nếu đã có hint → proceed ngay, không hỏi gì
  if (state.hint?.trim()) {
    return { status: 'scouting' };
  }

  // Autonomous mode + không có hint → tự assume "general bug check"
  if (state.investigationMode === 'autonomous') {
    return {
      hint: 'general bug investigation — scan for any errors or anomalies',
      status: 'scouting',
    };
  }

  // Interactive mode + không có hint → hỏi user
  return {
    status: 'needs_user_input',
    pendingQuestion:
      `Bạn đang gặp vấn đề gì trên trang này?\n` +
      `(Mô tả ngắn gọn, ví dụ: "thêm vào giỏ hàng bị crash", "trang không load được", "form submit không có gì xảy ra")`,
  };
}

function routeFromPreflight(state: AgentState): string {
  if (state.status === 'needs_user_input') return 'ask_user';
  return 'proceed';
}
```

**Behavior theo mode và input:**

| Có hint? | Mode          | Hành vi                                      |
| -------- | ------------- | -------------------------------------------- |
| ✅ Có    | bất kỳ        | Proceed ngay → Scout                         |
| ❌ Không | `interactive` | Hỏi user → đợi → Scout                       |
| ❌ Không | `autonomous`  | Tự dùng "general investigation" hint → Scout |

**Terminal UX khi hỏi pre-flight:**

```
🤖 AI Debug Agent v4.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 URL: https://shop.com/cart

❓ Bạn đang gặp vấn đề gì trên trang này?
   (Ví dụ: "thêm vào giỏ hàng bị crash")

> thêm sản phẩm vào giỏ xong bị văng ra trang chủ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[00:05] 🔍 [Scout] Bắt đầu điều tra...
```

**Lý do cần Pre-flight:** Nếu Scout không biết bug ở đâu, nó phải click mọi thứ trên trang để tìm — tốn thời gian và dễ bỏ sót. Với hint "thêm vào giỏ hàng bị crash", Scout biết ngay cần focus vào cart flow, click Add to Cart, và observe network/console tại thời điểm đó.

---

### 4.1 Scout Node

**Chạy một lần đầu tiên.** Vào trang, quan sát baseline mà không làm gì đặc biệt. Mục tiêu: thu thập raw observations để Investigator xây hypothesis.

```typescript
// graph/nodes/scout.ts
async function scoutNode(state: AgentState): Promise<Partial<AgentState>> {
  // 1. Navigate đến URL
  // 2. Đợi page load hoàn toàn (networkidle)
  // 3. Thu thập ngay lập tức:
  //    - console errors/warnings
  //    - network requests có lỗi (4xx, 5xx, failed)
  //    - DOM overview (page title, main sections, interactive elements count)
  //    - bundle URLs (để biết có thể fetch source map nào)
  //    - bất kỳ spinner/skeleton/empty state bất thường nào
  // 4. Nếu có hint → navigate đến phần liên quan hint đó
  // 5. Thao tác cơ bản liên quan hint (vd: hint "cart" → click vào cart icon)

  return {
    initialObservations: observations,
    currentSessionId: sessionId,
    status: 'hypothesizing',
    evidence: [initialEvidenceFromObservations],
  };
}
```

**System Prompt:**

```
Bạn là Scout — nhiệm vụ quan sát và thu thập thông tin ban đầu.

NHIỆM VỤ:
1. Navigate đến URL được cung cấp
2. Quan sát tất cả những gì xảy ra: console, network, DOM
3. Nếu có hint, thực hiện hành động cơ bản liên quan hint đó
4. Thu thập bundle URLs từ network requests (các file .js)
5. Ghi lại mọi bất thường quan sát được

KHÔNG:
- Phân tích nguyên nhân
- Đưa ra kết luận
- Thực hiện nhiều thao tác phức tạp

OUTPUT: ScoutObservation đầy đủ
```

---

### 4.2 Investigator Node

**Node trung tâm của investigation loop.** Chỉ suy luận — không bao giờ gọi browser tools trực tiếp. Khi cần thao tác browser, Investigator viết `BrowserTask` và dispatch sang Explorer. Khi cần analysis (source map, hỏi user), Investigator gọi trực tiếp.

**Nguyên tắc phân chia trách nhiệm:**

- Investigator → _suy nghĩ, quyết định, đánh giá_ → cần Tier 1 (model mạnh)
- Explorer → _thực thi, quan sát, báo cáo_ → cần Tier 2 (model nhanh)

```typescript
// graph/nodes/investigator.ts
async function investigatorNode(state: AgentState): Promise<Partial<AgentState>> {
  // Tools Investigator được phép gọi trực tiếp:
  // - fetch_source_map, resolve_error_location, read_source_file  (analysis)
  // - ask_user                                                     (clarification)
  // - dispatch_browser_task                                        (→ Explorer)
  // - finish_investigation                                         (→ Synthesis)
  // KHÔNG được gọi: browser_navigate, browser_click, browser_fill, v.v.
  // Tất cả browser actions phải đi qua dispatch_browser_task → Explorer
  // Logic:
  // 1. Nếu có browserTaskResults mới → đọc + update hypothesis confidence
  // 2. Nếu chưa có hypotheses → sinh từ initialObservations + hint
  // 3. Pick hypothesis untested/partial → quyết định action type
  // 4a. Browser action → viết BrowserTask → dispatch_browser_task → set status='waiting_explorer'
  // 4b. Analysis action → gọi tool trực tiếp (source map, ask_user)
  // 5. Nếu hypothesis confirmed → set status='source_analysis'
  // 6. Nếu tất cả refuted + bị kẹt → ask_user hoặc finish với cannot_determine
}
```

**System Prompt:**

```
Bạn là Investigator — senior developer đang debug một bug.
Bạn CHỈ suy luận và ra quyết định. Mọi thao tác browser do Explorer thực thi.

MINDSET: Bạn không biết bug là gì. Bạn đang điều tra từ đầu.

── PHÂN CHIA CÔNG VIỆC ──────────────────────────────────────

Investigator (bạn) làm:
  - Đọc observations và evidence
  - Xây dựng và cập nhật hypotheses
  - Quyết định cần làm gì tiếp theo
  - Viết BrowserTask cho Explorer
  - Gọi trực tiếp: fetch_source_map, read_source_file, ask_user
  - Đánh giá kết quả Explorer báo về

Explorer (subagent) làm:
  - Nhận BrowserTask từ bạn
  - Thực thi toàn bộ browser actions (navigate, click, fill, screenshot…)
  - Báo cáo lại: console errors, network logs, DOM state, screenshot

── QUY TRÌNH ────────────────────────────────────────────────

BƯỚC 1 — Nếu có browserTaskResults mới:
  Đọc kết quả Explorer báo về.
  Map về hypothesis tương ứng (hypothesis_id).
  Update confidence dựa trên evidence mới.

BƯỚC 2 — Nếu chưa có hypotheses:
  Đọc initialObservations + hint.
  Tham chiếu Bug Pattern Catalogue để nhận diện pattern.
  Sinh 1–3 hypotheses, mỗi cái có statement, confidence, test_strategy.

BƯỚC 3 — Chọn hypothesis để test tiếp:
  Pick hypothesis có confidence cao nhất, status = untested hoặc partial.

BƯỚC 4A — Nếu cần thao tác browser:
  Gọi dispatch_browser_task với BrowserTask đầy đủ.
  BrowserTask phải self-contained — Explorer không có context nào khác ngoài task này.
  Phải chỉ rõ:
  - task: mô tả chính xác cần làm gì và quan sát gì
  - stopCondition: khi nào thì dừng và báo về
  - collectEvidence: ["console_errors", "network_logs", "screenshot"]

BƯỚC 4B — Nếu cần analysis:
  Gọi trực tiếp fetch_source_map / read_source_file / ask_user.

BƯỚC 5 — Đánh giá:
  - confirmed (0.9+): đủ evidence → set status = 'source_analysis'
  - partial (0.5–0.9): refine test_strategy → dispatch BrowserTask tiếp
  - refuted (<0.3): chuyển sang hypothesis khác

BƯỚC 6 — Khi nào hỏi user (chỉ interactive mode):
  a) Tất cả hypotheses refuted, không có hướng mới
  b) Bug liên quan business logic không suy ra được từ code/network
  c) Cần credentials, test data, hoặc account cụ thể

KHÔNG:
  - Gọi browser tools trực tiếp
  - Viết BrowserTask mơ hồ ("click around and see what happens")
  - Lặp BrowserTask giống hệt cái đã chạy mà không thay đổi gì

TOOLS:
  dispatch_browser_task, fetch_source_map, resolve_error_location,
  read_source_file, ask_user, finish_investigation
```

**Ví dụ BrowserTask Investigator viết:**

```json
{
  "task": "Navigate đến https://shop.com/cart. Tìm nút 'Add to Cart' cho sản phẩm đầu tiên. Click vào nút đó. Quan sát network request nào được gửi đi và response là gì. Đặc biệt chú ý request đến /api/cart/* — ghi lại request body và response body đầy đủ.",
  "subagentId": "explorer-1705123456789",
  "stopCondition": "Sau khi click Add to Cart và nhận được response từ /api/cart/add (hoặc sau 10s nếu không có request nào)",
  "collectEvidence": [
    "console_errors",
    "network_logs",
    "network_payload:/api/cart/add",
    "screenshot"
  ],
  "hypothesis_id": "h1",
  "timeoutMs": 30000
}
```

---

### 4.2b Explorer Node (Antigravity Browser Subagent)

**Subagent thực thi browser actions.** Nhận `BrowserTask` từ Investigator, thực thi one-shot, báo cáo kết quả. Explorer không có memory về context investigation — chỉ biết task hiện tại.

**Antigravity pattern:** Explorer dùng `ReusedSubagentId` cố định (`state.explorerSubagentId`) để giữ browser session xuyên suốt — cookies, localStorage, auth state không bị reset giữa các BrowserTask.

```typescript
// graph/nodes/explorer.ts
async function explorerNode(state: AgentState): Promise<Partial<AgentState>> {
  const task = state.pendingBrowserTask!;

  // Explorer thực thi one-shot với ReusedSubagentId
  // Browser session được giữ từ task trước (auth, cookies không bị mất)
  const result = await runBrowserSubagent(task, {
    subagentId: task.subagentId, // ReusedSubagentId — same browser context
    timeoutMs: task.timeoutMs,
  });

  return {
    browserTaskResults: [result],
    pendingBrowserTask: null,
    status: 'investigating', // trả control về Investigator
    iterationCount: state.iterationCount + 1,
  };
}
```

**System Prompt của Explorer:**

```
Bạn là Explorer — browser automation agent. Nhiệm vụ: thực thi chính xác BrowserTask được giao.

QUAN TRỌNG:
- Bạn không có context về bug đang điều tra — chỉ làm đúng task được mô tả
- Thực thi từng bước theo thứ tự, dừng khi stopCondition được thỏa mãn
- Collect đúng evidence được yêu cầu trong collectEvidence[]
- Báo cáo trung thực những gì quan sát được — không phân tích, không kết luận

TOOLS:
  browser_navigate, browser_get_dom, browser_click, browser_fill,
  browser_select, browser_upload_file, browser_scroll, browser_hover,
  browser_wait, browser_screenshot,
  get_console_logs, get_network_logs, get_network_payload

OUTPUT FORMAT:
{
  "taskCompleted": true/false,
  "stopConditionMet": true/false,
  "consoleErrors": [...],
  "networkLogs": [...],
  "screenshot": "base64...",
  "domSnapshot": "...",
  "summary": "Mô tả ngắn những gì đã thực thi và quan sát được"
}
```

**Routing: Investigator ↔ Explorer:**

```typescript
// graph/index.ts
const graph = new StateGraph(StateAnnotation)
  .addNode('preflight', preflightNode)
  .addNode('scout', scoutNode)
  .addNode('investigator', investigatorNode)
  .addNode('explorer', explorerNode) // MỚI v4.0.3
  .addNode('source_map', sourceMapNode)
  .addNode('ask_user', askUserNode)
  .addNode('synthesis', synthesisNode)

  .addEdge('__start__', 'preflight')
  .addConditionalEdges('preflight', routeFromPreflight, {
    proceed: 'scout',
    ask_user: 'ask_user',
  })
  .addEdge('scout', 'investigator')

  .addConditionalEdges('investigator', routeFromInvestigator, {
    dispatch_browser_task: 'explorer', // → Explorer thực thi
    continue_investigating: 'investigator', // analysis action, self-loop
    resolve_source_map: 'source_map',
    ask_user: 'ask_user',
    synthesize: 'synthesis',
    force_synthesize: 'synthesis',
  })

  .addEdge('explorer', 'investigator') // kết quả → về Investigator
  .addEdge('source_map', 'investigator')
  .addEdge('ask_user', 'investigator')
  .addEdge('synthesis', END);

function routeFromInvestigator(state: AgentState): string {
  if (state.iterationCount >= state.maxIterations) return 'force_synthesize';
  if (state.status === 'waiting_explorer') return 'dispatch_browser_task';
  if (state.status === 'needs_user_input') return 'ask_user';
  if (state.status === 'source_analysis') return 'resolve_source_map';
  if (state.status === 'synthesizing') return 'synthesize';
  return 'continue_investigating';
}
```

**TUI — phân biệt Investigator vs Explorer:**

```
[00:06] 🧠 [Investigator] Test h1: cần xem request body của POST /api/cart/add
[00:06] 📋 [Investigator → Explorer] BrowserTask dispatched:
        "Navigate đến cart, click Add to Cart, collect network payload /api/cart/add"
[00:07] 🌐 [Explorer] Navigating https://shop.com/cart...
[00:08] 🌐 [Explorer] Clicking "Add to Cart"...
[00:08] 🌐 [Explorer] Captured: POST /api/cart/add → 400
[00:08] 📊 [Explorer → Investigator] Task complete. 1 network error, 1 console error.
[00:09] 🧠 [Investigator] h1 confirmed (0.92): request body thiếu productId
```

---

### 4.3 Source Map Node

**Chạy khi Investigator xác định được error location trong bundle.** Resolve minified location về source gốc, sau đó **trace ngược import chain** để tìm root caller — không chỉ dừng ở file có lỗi.

```typescript
// graph/nodes/source-map.ts
async function sourceMapNode(state: AgentState): Promise<Partial<AgentState>> {
  const errorEvidence = state.evidence.filter(
    (e) => e.type === 'console_error' && e.content.includes('.js:'),
  );

  const resolutions: SourceMapResolution[] = [];

  for (const err of errorEvidence) {
    const location = parseErrorLocation(err.content);
    if (!location) continue;

    const sourceMap = await fetchSourceMap(location.bundleUrl, config);
    if (!sourceMap) continue;

    // 1. Resolve error location → original file:line
    const resolved = resolveSourceMap(sourceMap, location.line, location.column);

    // 2. Đọc code snippet xung quanh điểm lỗi (15 dòng)
    const snippet = await readSourceSnippet(resolved, 15);

    // 3. MỚI v4.0.2 — Trace import chain từ file lỗi
    //    Mục tiêu: tìm root caller, không chỉ file có lỗi
    const importChain = await traceImportChain(resolved, sourceMap);

    resolutions.push({ ...resolved, codeSnippet: snippet, importChain });
  }

  return {
    sourceMapResolutions: resolutions,
    status: resolutions.length > 0 ? 'investigating' : state.status,
  };
}
```

**Import chain tracing — v4.0.2:**

```typescript
// sourcemap/tracer.ts
interface ImportChainLink {
  file: string; // "src/features/cart/CartService.ts"
  callerLine: number; // dòng gọi function của file dưới
  callerCode: string; // snippet tại dòng đó
  role: string; // "service" | "component" | "hook" | "store" | "util"
}

async function traceImportChain(
  errorLocation: SourceMapResolution,
  sourceMap: SourceMap,
  maxDepth: number = 4, // trace tối đa 4 cấp lên
): Promise<ImportChainLink[]> {
  const chain: ImportChainLink[] = [];
  let currentFile = errorLocation.originalFile;

  for (let depth = 0; depth < maxDepth; depth++) {
    // Tìm file nào import currentFile trong source map sources[]
    const callers = findCallers(currentFile, sourceMap);
    if (callers.length === 0) break;

    // Chọn caller gần nhất (thường là component gọi service)
    const caller = callers[0];
    const callerSnippet = await readSourceSnippet(caller, 5);

    chain.push({
      file: caller.originalFile,
      callerLine: caller.originalLine,
      callerCode: callerSnippet,
      role: inferFileRole(caller.originalFile),
    });

    currentFile = caller.originalFile;

    // Dừng khi đến component layer (UI entry point)
    if (chain.at(-1)?.role === 'component') break;
  }

  return chain;
}

function inferFileRole(filePath: string): string {
  if (/component|page|view|screen/i.test(filePath)) return 'component';
  if (/service|api|client/i.test(filePath)) return 'service';
  if (/hook|use[A-Z]/i.test(filePath)) return 'hook';
  if (/slice|store|reducer|state/i.test(filePath)) return 'store';
  if (/util|helper|lib/i.test(filePath)) return 'util';
  return 'unknown';
}
```

**Output import chain trong report:**

```
Error location:  CartService.ts:45 — addItem()
  ← called by:  useCart.ts:23 (hook) — const result = await cartService.addItem(...)
  ← called by:  AddToCartButton.tsx:67 (component) — const { addItem } = useCart()
  ← UI entry:   ProductCard.tsx:112 (component) — <AddToCartButton productId={id} />
```

Đây là thông tin Investigator cần để viết suggested fix đúng layer — fix ở component, không phải ở service.

**Source map fetch strategy:**

```typescript
// tools/source-map.ts
async function fetchSourceMap(bundleUrl: string, config: Config): Promise<SourceMap | null> {
  // Strategy 1: fetch public URL
  const publicMapUrl = await extractSourceMappingUrl(bundleUrl);
  if (publicMapUrl) {
    try {
      const res = await fetch(publicMapUrl);
      if (res.ok) return parseSourceMap(await res.json());
    } catch {
      /* không public */
    }
  }

  // Strategy 2: local path từ config
  const localMapPath = config.sourcemap?.localPath;
  if (localMapPath) {
    try {
      const content = await fs.readFile(localMapPath, 'utf-8');
      return parseSourceMap(JSON.parse(content));
    } catch {
      /* file không tồn tại */
    }
  }

  // Strategy 3: scan thư mục build phổ biến
  const buildDirs = config.sourcemap?.buildDir
    ? [config.sourcemap.buildDir]
    : ['./dist', './build', './.next', './out'];

  const bundleName = path.basename(new URL(bundleUrl).pathname);
  for (const dir of buildDirs) {
    const candidate = path.join(dir, `${bundleName}.map`);
    if (await fileExists(candidate)) {
      const content = await fs.readFile(candidate, 'utf-8');
      return parseSourceMap(JSON.parse(content));
    }
  }

  return null;
}
```

---

### 4.4 Ask User Node

**Interrupt flow — hỏi user qua terminal.** Chỉ active ở `interactive` mode. Ở `autonomous` mode, node này bị bypass hoàn toàn — Investigator tự assume và tiếp tục.

```typescript
// graph/nodes/ask-user.ts
async function askUserNode(state: AgentState): Promise<Partial<AgentState>> {
  // Autonomous mode: không bao giờ chạy vào đây
  // (routeFromInvestigator chặn trước khi route sang ask_user)
  // Node này chỉ được gọi khi mode = 'interactive'

  const question = state.pendingQuestion!;

  tui.showQuestion(question);
  const answer = await readline.question(`\n❓ ${question}\n> `);
  tui.resumeInvestigation();

  return {
    userClarifications: [{ question, answer, timestamp: new Date().toISOString() }],
    status: 'investigating',
    pendingQuestion: null,
  };
}
```

**Routing logic phân biệt mode:**

```typescript
// graph/index.ts
function routeFromInvestigator(state: AgentState): string {
  if (state.iterationCount >= state.maxIterations) return 'force_synthesize';
  if (state.status === 'source_analysis') return 'resolve_source_map';
  if (state.status === 'synthesizing') return 'synthesize';

  if (state.status === 'needs_user_input') {
    if (state.investigationMode === 'interactive') {
      return 'ask_user'; // hỏi user, đợi trả lời
    } else {
      // autonomous: không hỏi — inject assumption và tiếp tục
      return 'continue_investigating'; // Investigator sẽ nhận được assumption đã inject
    }
  }

  return 'continue_investigating';
}
```

**Autonomous mode — inject assumption thay vì hỏi:**

```typescript
// graph/nodes/investigator.ts
// Khi Investigator set status = 'needs_user_input' ở autonomous mode,
// orchestrator inject assumption vào conversation thay vì route sang ask_user:

function buildAssumptionInjection(pendingQuestion: string): string {
  return (
    `[AUTONOMOUS MODE] Câu hỏi "${pendingQuestion}" không được hỏi user. ` +
    `Hãy đưa ra assumption hợp lý nhất dựa trên evidence hiện có, ` +
    `ghi assumption đó vào danh sách assumptions[], và tiếp tục điều tra.`
  );
}
```

**Terminal UX:**

```
# Interactive mode — dừng và hỏi
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Investigation paused — cần thêm context

🤔 "API /api/cart/add trả 401. User cần login
    trước để test cart flow không?"

> yes, cần login với account có item trong wishlist
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Autonomous mode — tự assume, không dừng
[00:08] 🤖 [Investigator/autonomous] Cần biết auth requirement
        → Assuming: guest user có thể add to cart
        → Ghi vào assumptions[]: "Cart flow không yêu cầu auth"
[00:08] 🧠 [Investigator] Tiếp tục test với guest session...
```

---

### 4.5 Synthesis Node

**Chạy một lần cuối.** Nhận toàn bộ evidence + source analysis, tổng hợp thành report cuối.

```typescript
// graph/nodes/synthesis.ts
async function synthesisNode(state: AgentState): Promise<Partial<AgentState>> {
  // Investigator đã thu thập đủ evidence
  // Source map đã resolved (nếu có)
  // Code analysis đã thực hiện (nếu có)

  // Synthesis tổng hợp:
  // 1. Root cause statement — chính xác, kỹ thuật
  // 2. Code location — file:line nếu có source map
  // 3. Data flow — UI component → service → API → state update
  // 4. Suggested fix — before/after code snippet
  // 5. Repro steps — từ evidence
  // 6. Severity assessment
  // 7. Assumptions — những gì agent đã assume

  return {
    finalReport: report,
    status: 'done',
  };
}
```

---

## 5. Tool Set — MCP Tools

Tách thành hai nhóm rõ ràng theo agent sử dụng:

| Nhóm               | Agent dùng            | Mô tả                                             |
| ------------------ | --------------------- | ------------------------------------------------- |
| **Browser Tools**  | Explorer (Tier 2)     | Thao tác browser — navigate, click, fill, observe |
| **Analysis Tools** | Investigator (Tier 1) | Source map, hỏi user, dispatch browser task       |

### 5.1 Browser Tools — Explorer only

Explorer là agent duy nhất được phép gọi các tools này. Investigator không gọi trực tiếp.

| Tool                  | Mô tả                                               |
| --------------------- | --------------------------------------------------- |
| `browser_navigate`    | Navigate đến URL                                    |
| `browser_get_dom`     | Lấy interactive elements + stability score          |
| `browser_click`       | Click (qua guardrails)                              |
| `browser_fill`        | Điền text                                           |
| `browser_select`      | Chọn dropdown option                                |
| `browser_upload_file` | Upload file test                                    |
| `browser_scroll`      | Scroll                                              |
| `browser_hover`       | Hover                                               |
| `browser_wait`        | Chờ condition                                       |
| `browser_screenshot`  | Chụp màn hình                                       |
| `get_console_logs`    | Console errors/warnings kể từ session start         |
| `get_network_logs`    | Tất cả requests: method, URL, status, timing        |
| `get_network_payload` | Request body + Response body của một request cụ thể |

```typescript
// tools/get-network-payload.ts
interface NetworkPayload {
  requestUrl: string;
  requestMethod: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  responseTime: number;
}
```

### 5.2 Analysis Tools — Investigator only

Investigator gọi trực tiếp — không qua Explorer.

| Tool                     | Agent        | Mô tả                                          |
| ------------------------ | ------------ | ---------------------------------------------- |
| `dispatch_browser_task`  | Investigator | Viết BrowserTask + gửi sang Explorer           |
| `fetch_source_map`       | Investigator | Fetch + parse source map từ bundle URL         |
| `resolve_error_location` | Investigator | Resolve minified location → original file:line |
| `read_source_file`       | Investigator | Đọc file source sau khi resolve                |
| `ask_user`               | Investigator | Hỏi user qua terminal (interactive mode only)  |
| `finish_investigation`   | Investigator | Trigger Synthesis Node                         |

```typescript
// tools/dispatch-browser-task.ts
// Investigator gọi tool này để giao việc cho Explorer
interface DispatchBrowserTaskInput {
  task: string; // self-contained description — Explorer không có context khác
  stopCondition: string; // khi nào dừng và báo về
  collectEvidence: string[]; // ["console_errors", "network_logs", "screenshot", "dom_state",
  //  "network_payload:/api/cart/add"]  ← có thể chỉ định URL cụ thể
  hypothesis_id: string;
  timeoutMs: number; // từ Profiler profile.taskTimeoutMs
}

// tools/fetch-source-map.ts
interface FetchSourceMapInput {
  bundleUrl: string;
  localMapPath?: string;
}
interface FetchSourceMapOutput {
  success: boolean;
  origin: 'public_url' | 'local_path' | 'build_dir_scan' | 'not_found';
  mapUrl: string;
  sourcesCount: number;
}

// tools/resolve-error-location.ts
interface ResolveInput {
  bundleUrl: string;
  line: number;
  column: number;
}
interface ResolveOutput {
  originalFile: string;
  originalLine: number;
  originalColumn: number;
  surroundingCode: string;
  functionName: string;
}

// tools/read-source-file.ts
interface ReadSourceInput {
  filePath: string;
  lineFrom: number;
  lineTo: number;
}
interface ReadSourceOutput {
  content: string;
  totalLines: number;
}

// tools/ask-user.ts
interface AskUserInput {
  question: string;
  context: string; // tại sao cần hỏi
  attempts: number; // đã thử bao nhiêu hướng
}
```

---

## 6. Config

```json
{
  "baseUrl": "http://localhost:3000",
  "llm": {
    "default": {
      "provider": "ollama",
      "baseUrl": "http://localhost:11434/v1",
      "model": "qwen2.5:7b",
      "apiKey": ""
    },
    "investigator": {
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-4o",
      "apiKey": "$OPENAI_API_KEY"
    },
    "explorer": {
      "provider": "google",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
      "model": "gemini-2.0-flash",
      "apiKey": "$GOOGLE_API_KEY"
    },
    "scout": {
      "provider": "google",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
      "model": "gemini-2.0-flash",
      "apiKey": "$GOOGLE_API_KEY"
    }
  },
  "auth": {
    "enabled": false,
    "strategy": "form",
    "loginUrl": "/login",
    "credentials": {
      "email": "dev@test.com",
      "password": "$TEST_USER_PASSWORD"
    },
    "successIndicator": "/dashboard",
    "timeoutMs": 30000
  },
  "sourcemap": {
    "localPath": null,
    "buildDir": "./dist",
    "enabled": true
  },
  "browser": {
    "headless": true,
    "slowMo": 0,
    "timeout": 30000,
    "viewport": { "width": 1280, "height": 720 },
    "spaWaitMs": null,
    "spaFillWaitMs": null
  },
  "agent": {
    "maxIterations": 30,
    "taskTimeoutMs": 90000,
    "tokenBudgetRatio": 0.85,
    "maxRetries": 3,
    "retryBaseDelayMs": 1000,
    "mode": "interactive"
  },
  "guardrails": {
    "allowList": []
  },
  "output": {
    "reportsDir": "./debug-reports",
    "deduplicationThreshold": 0.85
  }
}
```

**Config field mới trong v4.0:**

| Field                 | Mô tả                                                             | Default            |
| --------------------- | ----------------------------------------------------------------- | ------------------ |
| `sourcemap.localPath` | Path đến `.map` file local (override auto-fetch)                  | `null`             |
| `sourcemap.buildDir`  | Thư mục build để scan source map                                  | `./dist`           |
| `sourcemap.enabled`   | Bật/tắt source map resolution                                     | `true`             |
| `llm.investigator.*`  | Model cho Investigator — cần mạnh nhất                            | fallback `default` |
| `llm.scout.*`         | Model cho Scout — cần nhanh                                       | fallback `default` |
| `agent.mode`          | `interactive` (hỏi user khi bị kẹt) hoặc `autonomous` (tự assume) | `interactive`      |
| `agent.maxIterations` | Tăng lên 30 (v3 là 20) — investigation cần nhiều bước hơn         | `30`               |
| `agent.taskTimeoutMs` | Tăng lên 90s — source map fetch có thể chậm                       | `90000`            |

**Agent-Model mapping:**

| Agent        | Vai trò                                                       | Model gợi ý                        | Lý do                                                  |
| ------------ | ------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| Investigator | Xây hypothesis, viết BrowserTask, đánh giá evidence, đọc code | Tier 1 (gpt-4o, claude-sonnet)     | Reasoning phức tạp, cần hiểu code và viết task rõ ràng |
| Explorer     | Thực thi BrowserTask one-shot, báo cáo quan sát               | Tier 2 (gemini-flash, gpt-4o-mini) | Nhanh, chỉ execute + collect, không cần reasoning sâu  |
| Scout        | Navigate, thu thập data baseline                              | Tier 2 (gemini-flash, gpt-4o-mini) | Nhanh, chỉ observe                                     |
| Synthesis    | Tổng hợp evidence thành report                                | Tier 1 hoặc Tier 2                 | Format + reasoning nhẹ                                 |

**Lưu ý quan trọng về Explorer:** Explorer dùng `ReusedSubagentId` — cùng một ID xuyên suốt session. Điều này đảm bảo mỗi BrowserTask tiếp theo được thực thi trong cùng browser context (cookies, localStorage, auth state không bị reset). Investigator không cần lo việc login lại giữa các tasks.

---

## 7. Model Auto-Profiler (kế thừa v3.2, mở rộng cho roles mới)

```typescript
// model/profiler.ts — cập nhật v4.0
export type AgentRole = 'investigator' | 'scout' | 'synthesis';

export interface ModelProfile {
  tier: ModelTier;
  domElementLimit: number;
  tokenBudgetRatio: number;
  taskTimeoutMs: number;
  spaWaitMs: number;
  spaFillWaitMs: number;
  maxHypotheses: number; // MỚI v4.0: số hypothesis tối đa Investigator sinh ra
  sourceMapEnabled: boolean; // MỚI v4.0: model Tier 3 tắt source map (quá phức tạp)
}

export const TIER_PROFILES: Record<ModelTier, ModelProfile> = {
  tier1: {
    tier: 'tier1',
    domElementLimit: 150,
    tokenBudgetRatio: 0.85,
    taskTimeoutMs: 90_000,
    spaWaitMs: 300,
    spaFillWaitMs: 100,
    maxHypotheses: 5,
    sourceMapEnabled: true,
  },
  tier2: {
    tier: 'tier2',
    domElementLimit: 80,
    tokenBudgetRatio: 0.75,
    taskTimeoutMs: 120_000,
    spaWaitMs: 400,
    spaFillWaitMs: 150,
    maxHypotheses: 3,
    sourceMapEnabled: true,
  },
  tier3: {
    tier: 'tier3',
    domElementLimit: 40,
    tokenBudgetRatio: 0.6,
    taskTimeoutMs: 180_000,
    spaWaitMs: 600,
    spaFillWaitMs: 250,
    maxHypotheses: 2,
    sourceMapEnabled: false, // local model không xử lý được source map phức tạp
  },
};
```

**Lưu ý quan trọng với v4.0:** Source map analysis yêu cầu model hiểu code. Tier 3 (local 7B) tắt source map tự động — Investigator sẽ dừng ở mức console/network error thay vì đào xuống source. Nếu user muốn source analysis với model nhỏ, phải force override `"tier": "tier1"` trong config.

---

## 8. Service Interface

AI Debug Agent expose hai interface song song, share cùng investigation graph:

```
MCP Client (Antigravity, Claude Desktop, Cursor...)  →  MCP Server  →  Investigation Graph
REST Client (Web UI, Slack bot, CI/CD, curl)          →  REST API    →  Investigation Graph
CLI (local dev convenience)                           →  REST API    →  Investigation Graph
```

### 8.1 MCP Interface — tool `investigate_bug`

MCP server expose tool `investigate_bug` cho bất kỳ MCP client nào gọi:

```typescript
// Tool definition trong MCP server
server.tool(
  'investigate_bug',
  {
    description:
      'Investigate a web application bug. Navigates to URL, observes, builds hypotheses, and produces a root cause report.',
    inputSchema: InvestigationRequestSchema,
  },
  async (request) => {
    const result = await investigationGraph.invoke(request);
    return { content: [{ type: 'text', text: JSON.stringify(result.finalReport) }] };
  },
);
```

**MCP config cho client:**

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

### 8.2 REST API

Hono server, lightweight, edge-compatible:

```typescript
// api/server.ts
import { Hono } from 'hono';
import { stream } from 'hono/streaming';

const app = new Hono();

// Start investigation
app.post('/investigate', async (c) => {
  const request = InvestigationRequestSchema.parse(await c.req.json());
  const threadId = `debug-${Date.now()}`;

  // Fire-and-forget — client polls or streams
  investigationGraph.invoke(request, { configurable: { thread_id: threadId } });

  return c.json({ threadId, status: 'started' });
});

// Poll status
app.get('/investigate/:threadId', async (c) => {
  const state = await investigationGraph.getState({
    configurable: { thread_id: c.req.param('threadId') },
  });
  return c.json({
    status: state.values.status,
    hypotheses: state.values.hypotheses,
    evidence: state.values.evidence.length,
    report: state.values.finalReport,
  });
});

// SSE stream — realtime events
app.get('/investigate/:threadId/stream', (c) => {
  return stream(c, async (stream) => {
    const unsubscribe = eventBus.subscribe((event) => {
      stream.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    // Keep alive until investigation done
    await investigationGraph.waitForCompletion(c.req.param('threadId'));
    unsubscribe();
  });
});

// List reports
app.get('/reports', async (c) => {
  const reports = loadRegistry().reports;
  const severity = c.req.query('severity');
  const url = c.req.query('url');
  return c.json(
    reports.filter((r) => (!severity || r.severity === severity) && (!url || r.url.includes(url))),
  );
});
```

### 8.3 Shared Request Schema

Cả MCP và REST dùng chung schema:

```typescript
// shared/types.ts
const InvestigationRequestSchema = z.object({
  url: z.string().url(),
  hint: z.string().optional(),
  mode: z.enum(['interactive', 'autonomous']).default('autonomous'),
  callbackUrl: z.string().url().optional(), // cho interactive mode trên cloud
  sourcemapDir: z.string().optional(),

  // Request-level config override
  config: z
    .object({
      llm: z
        .object({
          investigator: z
            .object({
              provider: z.string(),
              model: z.string(),
              baseURL: z.string().optional(),
              apiKey: z.string().optional(),
            })
            .partial()
            .optional(),
          explorer: z
            .object({
              provider: z.string(),
              model: z.string(),
              baseURL: z.string().optional(),
              apiKey: z.string().optional(),
            })
            .partial()
            .optional(),
        })
        .partial()
        .optional(),
      agent: z
        .object({
          maxIterations: z.number().optional(),
          maxRetries: z.number().optional(),
        })
        .partial()
        .optional(),
    })
    .optional(),
});

type InvestigationRequest = z.infer<typeof InvestigationRequestSchema>;
```

**Config precedence:** request > env vars > file (`ai-debug.config.json`) > defaults.

### 8.4 CLI Wrapper (optional, local dev)

Thin wrapper gọi REST API, dùng khi phát triển hoặc debug local:

```bash
# Start server
ai-debug serve --port 3100

# Investigate (gọi REST API)
ai-debug run --url "https://shop.com/cart" --hint "cart crash"
ai-debug run --url "https://shop.com/cart" --mode autonomous
ai-debug run --url "https://shop.com/cart" --sourcemap-dir "./dist"

# Resume
ai-debug resume --thread-id "debug-1705123456789"

# Reports
ai-debug list
ai-debug list --severity critical
ai-debug open --latest
```

### 8.5 Output mẫu (CLI mode)

```
🤖 AI Debug Agent v4.1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 URL     : https://shop.com/cart
💡 Hint    : thêm vào giỏ hàng bị crash
🧠 Models  : Investigator (gpt-4o) | Explorer (gemini-2.0-flash) | Scout (gemini-2.0-flash)
⚙️  Mode    : autonomous
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[00:01] 🔍 [Scout] Vào trang https://shop.com/cart...
[00:03] 🔍 [Scout] Phát hiện: 1 console error, 0 network errors lúc load
[00:03] 🔍 [Scout] Click "Add to Cart" để trigger hint flow...
[00:04] 🔍 [Scout] → POST /api/cart/add → 400 Bad Request
[00:04] 🔍 [Scout] → Console: TypeError: Cannot read property 'id' of undefined
[00:05] 🧠 [Investigator] Observations nhận được. Xây hypotheses...

     Hypotheses:
     ├── h1 [0.75] API /api/cart/add trả 400 — request body thiếu field
     ├── h2 [0.60] JS exception khi parse 400 response — không có null check
     └── h3 [0.30] Product state chưa load xong khi user click Add

[00:06] 🧠 [Investigator] Test h1: Xem request payload của POST /api/cart/add
[00:06] 🔧 → get_network_payload /api/cart/add
[00:07]    Request:  { "quantity": 1 }  ← thiếu productId!
[00:07]    Response: { "error": "productId is required" }
[00:07] 🧠 [Investigator] h1 confirmed (0.92). h2 cũng có thể đúng — test tiếp
[00:08] 🧠 [Investigator] Test h2: Tìm source của TypeError
[00:08] 🔧 → resolve_error_location main.abc123.js:1:48291
[00:09] ✅ Resolved: src/features/cart/AddToCartButton.tsx:67
[00:09] 🧠 [Investigator] Đọc code gốc...
[00:10] 🔧 → read_source_file src/features/cart/AddToCartButton.tsx:60-75
[00:11] 🧠 [Investigator] Root cause xác định. Đủ evidence.
[00:12] 📝 [Synthesis] Tổng hợp report...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Điều tra hoàn thành!
   📄 ./debug-reports/cart-2024-01-15T10-30-00.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 9. Observability Layer

Kế thừa toàn bộ từ v3.3 (EventBus, pino JSONL logger). Cập nhật cho v4.1:

**EventBus là primary** — tất cả events đi qua EventBus. Consumers:

- **pino JSONL** — structured log file (giữ nguyên)
- **SSE stream** — REST API stream events realtime cho web dashboard hoặc remote consumers
- **MCP notifications** — stream progress events cho MCP client
- **ink TUI** — optional, chỉ khi chạy CLI mode (local dev)

```typescript
type AgentEvent =
  // v3.x events (giữ nguyên)
  | { type: 'reasoning'; agent: AgentName; text: string }
  | { type: 'tool_call'; agent: AgentName; tool: string; args: unknown }
  | { type: 'tool_result'; agent: AgentName; tool: string; success: boolean; durationMs: number }
  | { type: 'llm_usage'; agent: AgentName; promptTokens: number; completionTokens: number }
  | { type: 'error'; agent: AgentName; message: string }

  // v4.0 events mới
  | { type: 'hypothesis_created'; hypotheses: Hypothesis[] }
  | {
      type: 'hypothesis_updated';
      id: string;
      oldConfidence: number;
      newConfidence: number;
      status: string;
    }
  | { type: 'sourcemap_resolved'; bundleUrl: string; originalFile: string; line: number }
  | { type: 'sourcemap_failed'; bundleUrl: string; reason: string }
  | { type: 'user_question'; question: string; context: string }
  | { type: 'user_answered'; question: string }
  | {
      type: 'investigation_phase';
      phase: 'scouting' | 'hypothesizing' | 'investigating' | 'source_analysis' | 'synthesizing';
    };
```

### TUI Layout v4.0

```
┌─ AI Debug Agent v4.0 ──────────────────────────────────────┐
│ URL: https://shop.com/cart    [03:42]   iter 4 / 30        │
│ Investigator: gpt-4o (Tier 1) | Scout: gemini-2.0-flash    │
├─ Investigation Status ─────────────────────────────────────┤
│                                                            │
│  Phase: INVESTIGATING                                      │
│                                                            │
│  Hypotheses:                                               │
│  ├── h1 ████████░░ 0.92 [confirmed] API body thiếu field   │
│  ├── h2 ██████░░░░ 0.60 [testing]  null check missing      │
│  └── h3 ███░░░░░░░ 0.30 [untested] state race condition    │
│                                                            │
├─ Current Action ───────────────────────────────────────────┤
│  🧠 INVESTIGATOR  [gpt-4o]                                  │
│  ┆ "h1 confirmed: POST /api/cart/add thiếu productId.      │
│  ┆  Bây giờ test h2 — tìm source của TypeError để xác      │
│  ┆  nhận null check issue trong AddToCartButton."          │
│                                                            │
│  🔧 resolve_error_location                                  │
│     main.abc123.js:1:48291                                 │
│     ✓ → src/features/cart/AddToCartButton.tsx:67           │
│                                                            │
├─ Evidence ─────────────────────────────────────────────────┤
│  ❌ Network  POST /api/cart/add → 400 (body thiếu productId)│
│  🔴 Console  TypeError: Cannot read 'id' of undefined      │
│  📍 Source   AddToCartButton.tsx:67 — product?.id          │
└────────────────────────────────────────────────────────────┘
```

### 9.1 Streaming Format — `InvestigationStep`

Raw `AgentEvent` quá chi tiết cho consumer (web UI, Slack bot, MCP client). `StepAggregator` gom events thành structured `InvestigationStep`:

```typescript
// observability/step-aggregator.ts
interface InvestigationStep {
  timestamp: string;
  agent: 'scout' | 'investigator' | 'explorer' | 'synthesis';
  type: 'thinking' | 'action' | 'result' | 'hypothesis' | 'phase_change' | 'error';
  summary: string; // 1 dòng tóm tắt — luôn gửi
  detail?: string; // full reasoning — chỉ gửi ở verbose
  metadata?: Record<string, unknown>; // hypothesis data, tool args, timing...
}

// Transform: raw AgentEvent → InvestigationStep
function aggregateEvent(event: AgentEvent): InvestigationStep {
  switch (event.type) {
    case 'reasoning':
      return {
        timestamp: now(),
        agent: event.agent,
        type: 'thinking',
        summary: truncate(event.text, 100), // "h1 confirmed: POST thiếu productId..."
        detail: event.text, // full reasoning paragraph
      };

    case 'tool_call':
      return {
        timestamp: now(),
        agent: event.agent,
        type: 'action',
        summary: `🔧 ${event.tool}`,
        metadata: { tool: event.tool, args: event.args },
      };

    case 'tool_result':
      return {
        timestamp: now(),
        agent: event.agent,
        type: 'result',
        summary: `${event.success ? '✓' : '✗'} ${event.tool} (${event.durationMs}ms)`,
        metadata: { success: event.success, durationMs: event.durationMs },
      };

    case 'hypothesis_created':
      return {
        timestamp: now(),
        agent: 'investigator',
        type: 'hypothesis',
        summary: event.hypotheses.map((h) => `[${h.confidence}] ${h.statement}`).join(' | '),
        metadata: { hypotheses: event.hypotheses },
      };

    case 'investigation_phase':
      return {
        timestamp: now(),
        agent: 'investigator',
        type: 'phase_change',
        summary: `Phase → ${event.phase.toUpperCase()}`,
        metadata: { phase: event.phase },
      };

    // ... other events
  }
}
```

**SSE stream gửi `InvestigationStep`** (không phải raw `AgentEvent`):

```
data: {"timestamp":"00:07","agent":"investigator","type":"thinking","summary":"h1 confirmed: POST thiếu productId..."}

data: {"timestamp":"00:08","agent":"investigator","type":"action","summary":"🔧 resolve_error_location"}

data: {"timestamp":"00:09","agent":"investigator","type":"result","summary":"✓ resolve_error_location (1200ms)"}
```

### 9.2 MCP Progress Notifications

MCP protocol hỗ trợ `notifications/message` — stream progress trong khi `investigate_bug` tool đang chạy:

```typescript
// mcp-server/index.ts
server.tool('investigate_bug', schema, async (request, { sendNotification }) => {
  const unsubscribe = eventBus.subscribe((event) => {
    const step = aggregateEvent(event);

    sendNotification({
      method: 'notifications/message',
      params: {
        level: step.type === 'error' ? 'error' : 'info',
        logger: `ai-debug.${step.agent}`,
        data: step,
      },
    });
  });

  try {
    const result = await investigationGraph.invoke(request);
    return { content: [{ type: 'text', text: JSON.stringify(result.finalReport) }] };
  } finally {
    unsubscribe();
  }
});
```

**MCP client sẽ thấy:**

```
[ai-debug.scout]         🔍 Vào trang https://shop.com/cart...
[ai-debug.scout]         🔧 browser_get_dom
[ai-debug.scout]         ✓ browser_get_dom (340ms)
[ai-debug.investigator]  Phase → HYPOTHESIZING
[ai-debug.investigator]  [0.75] API body thiếu field | [0.60] null check missing
[ai-debug.investigator]  🔧 get_network_payload
```

### 9.3 Stream Levels — Verbose vs Summary

| Level     | Gửi gì                                             | Consumer                  | Default    |
| --------- | -------------------------------------------------- | ------------------------- | ---------- |
| `summary` | `phase_change` + `hypothesis` + `result` + `error` | REST API, MCP, Slack bot  | ✅ API/MCP |
| `verbose` | Tất cả steps kể cả `thinking` + `action`           | CLI, local dev, debugging | ✅ CLI     |

```typescript
// observability/step-aggregator.ts
const SUMMARY_TYPES: Set<InvestigationStep['type']> = new Set([
  'phase_change',
  'hypothesis',
  'result',
  'error',
]);

function shouldStream(step: InvestigationStep, level: StreamLevel): boolean {
  if (level === 'verbose') return true;
  return SUMMARY_TYPES.has(step.type);
}
```

**Config:** `output.streamLevel: 'summary' | 'verbose'`. Request-level override: `{ "config": { "output": { "streamLevel": "verbose" } } }`.

### 9.4 Correlation Tracing — `actionId`

Khi Explorer click một nút, Investigator cần biết chính xác network request nào và console error nào phát sinh từ cú click đó — không phải từ background polling hay timer.

**Giải pháp:** Mỗi browser action sinh `actionId`. `collector.ts` capture network + console trong time window sau action, gắn cùng `actionId`.

```typescript
// browser/collector.ts
interface CapturedRequest {
  actionId: string;
  method: string;
  url: string;
  status: number; // HTTP status code (0 nếu chưa có response)
  requestStart: number; // timestamp khi request bắt đầu
  responseEnd: number; // timestamp khi response hoàn tất
  durationMs: number; // responseEnd - requestStart
  initiator: string; // frame URL that initiated the request
}

interface CapturedLog {
  actionId: string;
  type: 'log' | 'warning' | 'error' | 'info';
  text: string;
  timestamp: number;
}

interface CorrelatedEvidence {
  actionId: string; // uuid
  action: string; // 'click #add-to-cart-btn'
  timestamp: number;
  networkEvents: CapturedRequest[]; // requests bắt đầu trong 3s sau action
  consoleEvents: CapturedLog[]; // console entries trong 3s sau action
}

async function executeAndCollect(
  page: Page,
  action: () => Promise<void>,
  actionLabel: string,
): Promise<CorrelatedEvidence> {
  const actionId = crypto.randomUUID();
  const startTime = Date.now();
  const WINDOW_MS = 3000; // 3 giây sau action

  const networkEvents: CapturedRequest[] = [];
  const consoleEvents: CapturedLog[] = [];

  // Start listeners TRƯỚC khi action
  const onRequest = (req: Request) => {
    if (Date.now() - startTime <= WINDOW_MS) {
      networkEvents.push({
        actionId,
        url: req.url(),
        method: req.method(),
        initiator: req.frame()?.url() ?? 'unknown',
        timestamp: Date.now(),
      });
    }
  };
  const onConsole = (msg: ConsoleMessage) => {
    if (Date.now() - startTime <= WINDOW_MS) {
      consoleEvents.push({
        actionId,
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    }
  };

  page.on('request', onRequest);
  page.on('console', onConsole);

  await action();
  await page.waitForTimeout(WINDOW_MS);

  page.off('request', onRequest);
  page.off('console', onConsole);

  return { actionId, action: actionLabel, timestamp: startTime, networkEvents, consoleEvents };
}
```

**Investigator nhận:**

```json
{
  "actionId": "a1b2c3",
  "action": "click #add-to-cart-btn",
  "networkEvents": [{ "method": "POST", "url": "/api/cart/add", "status": 400 }],
  "consoleEvents": [
    { "type": "error", "text": "TypeError: Cannot read property 'id' of undefined" }
  ]
}
```

Không còn phải đoán "network error này có phải do click đó không" — `actionId` chứng minh quan hệ nhân quả.

`InvestigationStep` bổ sung field `correlationId?: string` để stream actionId qua SSE/MCP.

---

## 10. Bug Report Output v4.0

````markdown
# 🔍 Investigation Report — Cart: Add to Cart crash

**Thời gian:** 2024-01-15 10:30:00
**URL:** https://shop.com/cart
**Hint:** thêm vào giỏ hàng bị crash
**Models:** Investigator (openai/gpt-4o) | Scout (google/gemini-2.0-flash)
**Severity:** high

---

## Root Cause

`AddToCartButton.tsx` gọi `addToCart({ quantity: 1 })` mà không truyền `productId`
do `product` state chưa được hydrate khi component mount trong SSR context.
API `/api/cart/add` trả về 400, component catch error nhưng gọi `error.data.id`
trên undefined response → TypeError.

---

## Code Location

**File:** `src/features/cart/AddToCartButton.tsx`
**Line:** 67
**Function:** `handleAddToCart()`

```typescript
// HIỆN TẠI (lỗi):
const handleAddToCart = async () => {
  await addToCart({ quantity }); // ← thiếu productId
  setAdded(true);
};

// GỢI Ý FIX:
const handleAddToCart = async () => {
  if (!product?.id) return; // ← guard khi product chưa load
  await addToCart({ productId: product.id, quantity });
  setAdded(true);
};
```
````

---

## Data Flow

```
User click "Add to Cart"
  → AddToCartButton.handleAddToCart()       [AddToCartButton.tsx:67]
  → cartSlice.addToCart({ quantity: 1 })    [cartSlice.ts:23]  ← thiếu productId
  → POST /api/cart/add { quantity: 1 }      → 400 { error: "productId is required" }
  → catch(error) → setErrorState(error.data.id)  ← error.data là null → TypeError
```

---

## Hypotheses Investigated

| ID  | Statement                                        | Result       | Confidence |
| --- | ------------------------------------------------ | ------------ | ---------- |
| h1  | API /api/cart/add thiếu field trong request body | ✅ Confirmed | 0.92       |
| h2  | Null check missing khi parse error response      | ✅ Confirmed | 0.85       |
| h3  | Product state race condition                     | ❌ Refuted   | 0.15       |

---

## Repro Steps

1. Navigate đến `/cart`
2. Click nút "Add to Cart" trên bất kỳ product nào
3. Observe: Network tab → POST /api/cart/add → 400
4. Observe: Console → TypeError: Cannot read property 'id' of undefined

---

## Evidence

### Network

| Method | URL           | Status | Issue                                               |
| ------ | ------------- | ------ | --------------------------------------------------- |
| POST   | /api/cart/add | 400    | Request body: `{ quantity: 1 }` — thiếu `productId` |

### Console

```
TypeError: Cannot read properties of undefined (reading 'id')
    at handleAddToCart (AddToCartButton.tsx:67)
    at HTMLButtonElement.<anonymous>
```

### Source Map

- Bundle: `main.abc123.js:1:48291`
- Resolved: `src/features/cart/AddToCartButton.tsx:67`
- Source map origin: public URL

---

## Assumptions

- Product API (`/api/products/:id`) trả về đúng format — không test trực tiếp
- Authentication không liên quan — test với user guest

---

_Generated by AI Debug Agent v4.0.0 — Investigation-First Architecture_
_Investigator: gpt-4o (Tier 1) | Scout: gemini-2.0-flash (Tier 2)_

````

---

## 10b. Bug Pattern Catalogue *(khôi phục + mở rộng v4.0.2)*

Investigator dùng catalogue này để sinh hypothesis đúng hướng ngay từ đầu. Mỗi pattern có dấu hiệu nhận diện, hypothesis mẫu, và investigation strategy cụ thể.

### 10.1 API Error — Server trả lỗi rõ ràng

**Dấu hiệu:** Network 4xx/5xx, console error có HTTP status, response body có error message.

**Hypothesis mẫu:**
- "Request thiếu required field" → xem request body
- "Auth token hết hạn hoặc thiếu" → xem request headers
- "Server validation fail" → xem response error details

**Investigation strategy:**
1. `get_network_logs` → tìm request có status ≥ 400
2. `get_network_payload` → đọc request body + response body
3. So sánh request body với API schema (nếu có) hoặc với successful request
4. Nếu 401/403 → check auth header, check cookie
5. Source map → tìm đoạn code build request body → xem tại sao thiếu field

---

### 10.2 Silent Failure — Action không có gì xảy ra

**Dấu hiệu:** User click/submit nhưng không có network request, không có console error, UI không thay đổi. Không có dấu hiệu rõ ràng.

**Hypothesis mẫu:**
- "Event handler không được attach" → DOM element không có listener
- "Điều kiện guard ngăn action" → `if (!product || !user) return`
- "Promise rejected nhưng không có catch" → silent error

**Investigation strategy:**
1. `browser_screenshot` ngay sau action → so sánh DOM trước/sau
2. `get_console_logs` → tìm warning ẩn, không chỉ error
3. `get_network_logs` → verify không có request nào được gửi
4. `browser_get_dom` → kiểm tra button có `disabled` không, có `type="button"` thay vì submit không
5. Source map → tìm event handler → đọc guard conditions

---

### 10.3 JS Exception / Crash — Trang bị lỗi hoặc không render được

**Dấu hiệu:** White screen, component không render, console có `TypeError`/`ReferenceError`/`Cannot read property`.

**Hypothesis mẫu:**
- "Null/undefined access — data chưa load xong" → `obj.property` khi `obj` là undefined
- "Array method trên non-array" → API trả object thay vì array
- "Hydration mismatch (SSR)" → server render khác client render

**Investigation strategy:**
1. `get_console_logs` ngay sau page load → lấy full stack trace
2. `resolve_error_location` → tìm file gốc từ stack trace
3. `read_source_file` → đọc code xung quanh dòng lỗi
4. `get_network_logs` → kiểm tra data API trả về có đúng shape không
5. `get_network_payload` → so sánh response với expected type

---

### 10.4 Race Condition / Timing Bug

**Dấu hiệu:** Bug xảy ra không nhất quán, thường reproduce được khi thao tác nhanh hoặc khi network chậm. Double submit, stale data, incorrect state sau async operation.

**Hypothesis mẫu:**
- "Double submit — không có debounce/loading guard" → click nhanh 2 lần → 2 requests
- "State update sau unmount" → navigate đi rồi response về → `setState` trên unmounted component
- "Stale closure — function capture giá trị cũ" → callback dùng biến đã outdated

**Investigation strategy:**
1. Click/submit nhanh 2 lần liên tiếp → `get_network_logs` → đếm số requests
2. Navigate ngay sau action → `get_console_logs` → tìm "Can't perform state update on unmounted component"
3. Source map → tìm async handler → check có `isMounted` guard không, có `useRef` cho latest value không

---

### 10.5 State Management Bug

**Dấu hiệu:** Data đúng ở lần đầu, sai ở lần sau. Refresh fix được vấn đề. Data từ lần trước "rò rỉ" sang lần sau.

**Hypothesis mẫu:**
- "State không được reset khi navigate" → giỏ hàng hiện item cũ
- "Cache stale — không invalidate sau mutation" → cập nhật xong nhưng UI vẫn hiện data cũ
- "Shared mutable state giữa các instance" → singleton bị chia sẻ không đúng

**Investigation strategy:**
1. Reproduce flow → navigate đi → navigate lại → `browser_get_dom` → so sánh DOM
2. Thực hiện mutation (thêm/sửa/xóa) → `get_network_logs` → kiểm tra có refetch không
3. Mở 2 tab → thao tác ở tab 1 → check tab 2 → xem state có bị ảnh hưởng không
4. Source map → tìm store/slice → đọc reset logic, invalidation logic

---

### 10.6 Infinite Loading / Skeleton Không Biến Mất

**Dấu hiệu:** Spinner/skeleton hiển thị mãi không tắt. Có thể có network request, cũng có thể không.

**Hypothesis mẫu:**
- "Loading state không được set false khi lỗi" → request fail nhưng `isLoading` vẫn `true`
- "Request không bao giờ được gọi" → điều kiện trigger không thỏa
- "Response không match expected format" → data về nhưng component không nhận ra"

**Investigation strategy:**
1. `get_network_logs` → có request không? Status là gì?
2. Nếu có request thành công: `get_network_payload` → response có đúng shape không?
3. Nếu không có request: `browser_get_dom` → element trigger có render không? Có disabled không?
4. Chờ thêm 10s → `browser_screenshot` → so sánh, xem có thay đổi không
5. Source map → tìm loading state setter → tìm tất cả nơi set `isLoading = false`

---

### 10.7 Navigation / Routing Bug

**Dấu hiệu:** Redirect sai, URL thay đổi nhưng UI không đổi, back button behavior sai, deep link không hoạt động.

**Hypothesis mẫu:**
- "Redirect sau action trỏ sai URL" → sau login về `/` thay vì `/dashboard`
- "Route guard không cho vào dù đã auth" → cookie có nhưng guard không đọc được
- "History stack bị manipulate sai" → back button không về trang trước

**Investigation strategy:**
1. `browser_navigate` đến URL trực tiếp → quan sát redirect chain
2. `get_network_logs` → xem có request nào kiểm tra auth không, response là gì
3. `browser_get_dom` → đọc meta tags, check router outlet có render không
4. Source map → tìm router guard / middleware → đọc điều kiện redirect

---

### 10.8 Form / Input Bug

**Dấu hiệu:** Validation không hoạt động, submit không làm gì, data nhập vào bị mất, field không accept input.

**Hypothesis mẫu:**
- "Submit handler không được gọi" → `type="button"` thay vì `type="submit"`, hoặc missing `onSubmit`
- "Controlled input không update state" → `onChange` handler thiếu hoặc sai
- "Validation pass nhưng data sai" → trim/parse không đúng trước khi submit

**Investigation strategy:**
1. `browser_fill` vào form → `browser_submit` → `get_network_logs` → có request không?
2. Nếu không có request: `browser_get_dom` → kiểm tra form structure, button type
3. Thử submit với data edge case: empty string, max length, special characters
4. Source map → tìm form submit handler → đọc validation logic, data transformation

---

### 10.9 File Upload / Media Bug

**Dấu hiệu:** Upload không có response, progress không hiển thị, file bị reject silently, preview không render.

**Hypothesis mẫu:**
- "File size vượt limit nhưng không có thông báo" → server 413, UI không handle
- "CORS block upload đến CDN" → upload đến external URL bị block
- "File type validation sai" → accept attribute không match MIME type thực

**Investigation strategy:**
1. `browser_upload_file` với file nhỏ (< 100KB) → quan sát response
2. `browser_upload_file` với file lớn dần → tìm ngưỡng fail
3. `get_network_logs` → xem upload request đến đâu (same origin vs CDN)
4. `get_network_payload` → đọc multipart body, kiểm tra Content-Type header
5. Source map → tìm upload handler → đọc size check, type check, error handling

---

### 10.10 Performance / Memory Bug *(Limited support)*

**Dấu hiệu:** Trang chậm dần theo thời gian, memory tăng liên tục, interaction lag.

**Hypothesis mẫu:**
- "Event listener không được cleanup" → mỗi lần mount lại thêm listener
- "Interval/timeout không được clear" → accumulate over time
- "Infinite re-render" → useEffect dependency array sai

**Lưu ý:** AI Debug Agent không có profiling tools (no heap snapshot, no flame graph). Investigation strategy giới hạn ở symptom-level.

**Investigation strategy:**
1. `browser_navigate` đến trang → `browser_get_dom` → ghi nhận element count
2. Thực hiện action lặp đi lặp lại 5 lần → `browser_get_dom` lại → có gì tăng không?
3. `get_console_logs` → tìm warning "Maximum update depth exceeded"
4. Source map → tìm useEffect, setInterval, addEventListener → check cleanup return

---

## 11. Xử lý vấn đề kỹ thuật

Kế thừa toàn bộ từ v3.3 (p-retry, partial-json, js-tiktoken, signal-exit, lowdb, pino, LangGraph checkpointing). Thêm mới cho v4.0:

### 11.1 Source map không available — fallback strategy *(mở rộng v4.0.2)*

Khi không thể lấy source map (production app không expose, không có build dir local), investigation không dừng lại — chuyển sang các chiến lược thay thế theo thứ tự ưu tiên:

**Tier 1 — Đọc minified code trực tiếp (partial insight)**

Dù minified, bundle vẫn chứa string literals, function names không bị xóa, và API endpoint URLs. Investigator có thể tìm pattern liên quan:

```typescript
// sourcemap/fallback.ts
async function analyzeMinifiedBundle(
  bundleUrl: string,
  searchTerms: string[]   // từ evidence: "addToCart", "/api/cart/add", "productId"
): Promise<MinifiedAnalysis> {
  const bundleContent = await fetch(bundleUrl).then(r => r.text());

  const findings: string[] = [];
  for (const term of searchTerms) {
    // Tìm context xung quanh term trong minified code
    const idx = bundleContent.indexOf(term);
    if (idx !== -1) {
      findings.push(bundleContent.slice(Math.max(0, idx - 100), idx + 200));
    }
  }

  return { bundleUrl, searchTerms, findings, note: 'Minified — limited readability' };
}
````

**Tier 2 — Trace từ network payload (không cần source)**

Nếu API request có lỗi, response body thường chứa thông tin đủ để xác định vấn đề ở tầng nào:

```typescript
// Investigator gọi get_network_payload để đọc chi tiết
// Response: { "error": "productId is required", "field": "productId", "code": "MISSING_FIELD" }
// → Đủ để kết luận: frontend không truyền productId lên API
// → Suggested fix: kiểm tra frontend code tại thời điểm gọi API
```

**Tier 3 — Stack trace từ console (nếu có)**

Error stack trace trong console thường có function names dù đã minified — dùng để trace call order:

```
TypeError: Cannot read properties of undefined
  at t.addItem (main.js:1:48291)    ← tìm "addItem" trong bundle
  at e.handleClick (main.js:1:9823) ← tìm "handleClick"
  at HTMLButtonElement.<anonymous>
```

**Behavior trong report khi không có source map:**

```markdown
### Source Analysis

⚠️ Source map không available — analysis dựa trên runtime evidence

**Fallback strategy sử dụng:** Network payload analysis + Console stack trace
**Confidence:** Medium (không thể verify tại code level)

Dựa trên network payload:

- Request body thiếu `productId` → frontend không truyền field này
- Response: `{ error: "productId is required" }`

Để xác nhận root cause chính xác, cần source map. Cách lấy:

- Local: chạy `npm run build:sourcemap` và set `sourcemap.buildDir` trong config
- Production: deploy với `sourceMappingURL` header được expose
```

### 11.2 Source map quá lớn (>50MB)

**Hành vi:** Chỉ fetch phần cần thiết nếu có `x-sourcemap` header. Nếu phải fetch toàn bộ → cảnh báo user → chỉ resolve error location, không đọc full file.

### 11.3 Investigator loop không hội tụ

**Vấn đề:** Investigator cứ sinh hypothesis mới mà không confirm/refute cái cũ.

**Giải pháp:** Max hypotheses theo Tier. Sau 3 iteration không có hypothesis nào đạt `confirmed`, Investigator bị inject: _"Bạn đã thử {n} hướng. Tổng hợp evidence hiện có và gọi finish_investigation — dù chưa chắc chắn."_

### 11.4 `ask_user` — interactive mode on local + cloud

**Vấn đề:** Investigator hỏi user liên tục thay vì tự tìm hiểu. Trên cloud, `readline` không khả dụng.

**Giải pháp:**

- Hard limit 3 lần `ask_user` per session ở `interactive` mode
- Lần thứ 4 trở đi bị chặn — tự assume
- **Local (CLI mode):** dùng `readline` terminal input
- **Cloud (API/MCP):** POST câu hỏi đến `callbackUrl` (nếu có), đợi response (timeout 5 phút). Nếu không có `callbackUrl` → treat như `autonomous` — tự assume

```typescript
// graph/nodes/ask-user.ts
async function askUser(state: AgentState, config: Config): Promise<string> {
  if (state.investigationMode === 'autonomous') {
    throw new Error('Cannot ask user in autonomous mode');
  }
  if (state.userClarifications.length >= 3) {
    throw new Error('Max user questions reached, assuming...');
  }

  // Cloud mode — callbackUrl
  if (config.agent.callbackUrl) {
    const response = await fetch(config.agent.callbackUrl, {
      method: 'POST',
      body: JSON.stringify({
        type: 'question',
        threadId: state.threadId,
        question: state.pendingQuestion,
        context: state.hypotheses.map((h) => h.statement),
      }),
    });

    // Đợi response (polling hoặc webhook reply)
    const answer = await waitForAnswer(state.threadId, { timeoutMs: 300_000 });
    if (!answer) throw new Error('User did not respond within 5 minutes');
    return answer;
  }

  // Local mode — readline
  return await readlineQuestion(state.pendingQuestion!);
}
```

**Tóm tắt behavior theo mode + deployment:**

| Tình huống  | `interactive` (local) | `interactive` (cloud + callbackUrl) | `interactive` (cloud, no callbackUrl) | `autonomous`          |
| ----------- | --------------------- | ----------------------------------- | ------------------------------------- | --------------------- |
| Lần hỏi 1–3 | ✅ readline           | ✅ POST to callbackUrl              | ❌ Tự assume                          | ❌ Tự assume          |
| Lần hỏi 4+  | ❌ Tự assume          | ❌ Tự assume                        | ❌ Tự assume                          | ❌ Tự assume          |
| Report      | "User Clarifications" | "User Clarifications"               | "Assumptions" dài hơn                 | "Assumptions" dài hơn |

### 11.5 read_source_file trả về code minified

**Vấn đề:** Source map resolve về file đúng nhưng file đó vẫn là transpiled (TypeScript → JS, JSX → JS).

**Hành vi:** Vẫn hữu ích hơn minified. Report ghi rõ "Source shown is transpiled output, not original TypeScript." Nếu có thể access TypeScript source qua `tsconfig.json` paths → ưu tiên đọc `.ts` file.

### 11.6 Hypothesis confidence calibration

Investigator cần calibrate confidence đúng, không phải luôn tự tin. Nếu sau 2 lần test mà confidence không tăng lên rõ rệt → hypothesis bị đánh dấu `partial` và deprioritized.

---

### 11.7 Selector Stability Score _(kế thừa v3)_

**Vấn đề:** Không phải mọi CSS selector đều ổn định — `#submit-btn` rất stable, còn `.css-1x2y3z > div:nth-child(3)` rất fragile và sẽ thay đổi sau re-render.

**Giải pháp:** `dom.ts` gán `stabilityScore` cho mỗi element. Explorer ưu tiên selector có score cao nhất.

```typescript
// browser/dom.ts
function getStabilityScore(element: ElementHandle): { selector: string; score: number } {
  const strategies = [
    { attr: 'id', score: 100, build: (v: string) => `#${v}` },
    { attr: 'data-testid', score: 95, build: (v: string) => `[data-testid="${v}"]` },
    { attr: 'data-cy', score: 95, build: (v: string) => `[data-cy="${v}"]` },
    { attr: 'name', score: 80, build: (v: string) => `[name="${v}"]` },
    { attr: 'aria-label', score: 75, build: (v: string) => `[aria-label="${v}"]` },
    { attr: 'type+role', score: 60, build: (v: string) => v },
    { attr: 'text-content', score: 50, build: (v: string) => `text="${v}"` },
    { attr: 'class', score: 20, build: (v: string) => `.${v.split(' ')[0]}` },
    { attr: 'nth-child', score: 5, build: (v: string) => v },
  ];

  for (const strategy of strategies) {
    const value = getAttr(element, strategy.attr);
    if (value) return { selector: strategy.build(value), score: strategy.score };
  }

  return { selector: getFallbackSelector(element), score: 1 };
}
```

Explorer dùng `stabilityScore` để quyết định có cần `get_dom` lại sau re-render không: score < 30 → luôn re-fetch DOM trước khi dùng lại selector đó.

---

### 11.8 Browser Context Isolation _(kế thừa v3)_

**Vấn đề:** Nếu chạy 2 investigation instance song song, cả hai share cùng browser profile → cookies, localStorage, auth state conflict.

**Giải pháp:** Mỗi run tạo một Playwright `BrowserContext` riêng biệt.

```typescript
// browser/browser.ts
async function createIsolatedContext(config: BrowserConfig): Promise<BrowserContext> {
  const browser = await chromium.launch({ headless: config.headless });

  const context = await browser.newContext({
    viewport: config.viewport,
    recordVideo: {
      dir: `${config.output.reportsDir}/recordings/`,
    },
  });

  return context;
}
```

Mỗi `BrowserContext` có cookies, localStorage, sessionStorage riêng. Nhiều phiên debug song song không can thiệp lẫn nhau.

---

### 11.9 Zod validation cho finish_investigation payload _(kế thừa v3)_

**Vấn đề:** Investigator gọi `finish_investigation` để trigger Synthesis Node. Nếu payload không đúng format, Synthesis sinh report thiếu section mà không có error rõ ràng.

**Giải pháp:** Validate bằng Zod ngay khi nhận từ LLM, trước khi pass sang Synthesis. Nếu fail → inject error back vào Investigator để tự sửa, tối đa 2 lần.

```typescript
// shared/types.ts
const FinishInvestigationSchema = z.object({
  summary: z.string().min(10),
  rootCause: z.string().min(10),
  codeLocation: z
    .object({
      file: z.string(),
      line: z.number(),
      snippet: z.string(),
    })
    .nullable(),
  dataFlow: z.string().min(10),
  suggestedFix: z
    .object({
      file: z.string(),
      line: z.number(),
      before: z.string(),
      after: z.string(),
      explanation: z.string(),
    })
    .nullable(),
  reproSteps: z.array(z.string()).min(1),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  cannotDetermine: z.boolean().optional(),
  assumptions: z.array(z.string()),
});

// graph/nodes/investigator.ts — khi nhận finish_investigation result
const parsed = FinishInvestigationSchema.safeParse(payload);
if (!parsed.success) {
  if (retryCount < 2) {
    // Inject error back → Investigator sửa
    return {
      status: 'investigating',
      evidence: [{ type: 'error', content: `Invalid finish payload: ${parsed.error.message}` }],
    };
  }
  // Force proceed với partial data sau 2 lần fail
}
```

---

### 11.10 Secret management — config env resolution _(kế thừa v3)_

**Vấn đề:** Config `ai-debug.config.json` chứa API keys. Hardcode credentials trong file JSON là security risk.

**Giải pháp:** `config-loader.ts` hỗ trợ cú pháp `"$ENV_VAR_NAME"` — tự động resolve thành env variable tương ứng.

```typescript
// config-loader.ts
function resolveSecrets(config: RawConfig): Config {
  return JSON.parse(JSON.stringify(config), (_, value) => {
    if (typeof value === 'string' && value.startsWith('$')) {
      const envKey = value.slice(1);
      const resolved = process.env[envKey];
      if (!resolved) throw new Error(`Missing env variable: ${envKey}`);
      return resolved;
    }
    return value;
  });
}
```

**Sử dụng trong config:**

```json
{
  "llm": {
    "investigator": {
      "apiKey": "$OPENAI_API_KEY"
    },
    "explorer": {
      "apiKey": "$GOOGLE_API_KEY"
    }
  },
  "auth": {
    "credentials": {
      "password": "$TEST_USER_PASSWORD"
    }
  }
}
```

Mọi giá trị bắt đầu bằng `$` trong config đều được resolve từ `process.env`. Nếu env variable không tồn tại → throw error rõ ràng lúc startup, không phải lúc runtime.

---

### 11.11 Graceful shutdown _(kế thừa v3)_

**Vấn đề:** Ctrl+C khi đang investigate → browser không đóng, recording bị corrupt, checkpoint không flush.

**Giải pháp:** Register signal handler ngay khi khởi động. Cleanup theo thứ tự đảm bảo không mất data.

```typescript
// index.ts
import { onExit } from 'signal-exit';

onExit(async (code, signal) => {
  console.log(`\n⚠️  Shutting down (${signal})...`);

  // 1. Abort graph execution
  graphController.abort();

  // 2. Finalize video recording (flush WebP)
  await recorder.finalize();

  // 3. Flush pino logger (JSONL)
  await debugLogger.flush();

  // 4. Flush LangGraph checkpoint (SqliteSaver)
  await checkpointer.flush();

  // 5. Close browser
  await browserContext?.close();
  await browser?.close();

  // 6. Unmount TUI
  tuiApp?.unmount();
});

process.on('uncaughtException', async (err) => {
  eventBus.emit({ type: 'error', agent: 'system', message: err.message });
  process.exit(1); // triggers onExit cleanup
});
```

**Thứ tự cleanup quan trọng:** Recording phải finalize trước khi browser close, nếu không file WebP bị truncate. Checkpoint phải flush trước khi process exit, nếu không mất khả năng resume.

---

### 11.12 LLM retry — exponential backoff _(kế thừa v3)_

**Vấn đề:** LLM API thường xuyên trả 429 (rate limit), 503 (overloaded), hoặc timeout. Không có retry → toàn bộ investigation fail vì một transient error.

**Giải pháp:** `llm-client.ts` wrap mọi API call với `p-retry` — exponential backoff + jitter.

```typescript
// agent/llm-client.ts
import pRetry from 'p-retry';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function callLLM(messages: Message[], tools: Tool[], config: Config): Promise<Response> {
  const maxRetries = config.agent.maxRetries ?? 3;
  const baseDelayMs = config.agent.retryBaseDelayMs ?? 1000;

  return pRetry(
    async (attemptNumber) => {
      try {
        return await openai.chat.completions.create({ messages, tools });
      } catch (err) {
        const status = err?.status ?? err?.response?.status;
        if (!RETRYABLE_STATUS.has(status) && err.code !== 'ECONNRESET') {
          throw new pRetry.AbortError(err); // non-retryable → fail immediately
        }

        // Respect Retry-After header nếu có
        const retryAfter = err?.headers?.['retry-after'];
        if (retryAfter) {
          await sleep(parseInt(retryAfter) * 1000);
        }

        eventBus.emit({
          type: 'warning',
          message: `LLM API error (${status}), retry ${attemptNumber}/${maxRetries}...`,
        });

        throw err; // p-retry sẽ retry
      }
    },
    {
      retries: maxRetries,
      minTimeout: baseDelayMs,
      factor: 2,
      randomize: true, // jitter
    },
  );
}
```

**Config:**

```json
{
  "agent": {
    "maxRetries": 3,
    "retryBaseDelayMs": 1000
  }
}
```

Delay sequence: ~1s → ~2s → ~4s (với jitter ±20%). `Retry-After` header từ provider thắng nếu dài hơn computed delay.

---

### 11.13 Guardrails — Hard-coded safety _(kế thừa v3)_

**Vấn đề:** Không thể phụ thuộc hoàn toàn vào LLM để tránh actions nguy hiểm. Dù model mạnh đến đâu, guardrail ở tầng code vẫn cần thiết.

**Giải pháp:** Chặn cứng trong `actions.ts`, không phụ thuộc vào prompt.

```typescript
// browser/actions.ts
const DANGEROUS_KEYWORDS = [
  'delete',
  'remove',
  'xóa',
  'xoa',
  'hủy',
  'huy',
  'drop',
  'reset',
  'destroy',
  'purge',
  'clear all',
  'deactivate account',
  'delete account',
];

async function safeClick(page: Page, selector: string): Promise<void> {
  const element = await page.$(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);

  const text = (await element.textContent()) ?? '';
  const ariaLabel = (await element.getAttribute('aria-label')) ?? '';
  const combined = `${text} ${ariaLabel}`.toLowerCase();

  const isDangerous = DANGEROUS_KEYWORDS.some((kw) => combined.includes(kw));
  if (isDangerous) {
    throw new Error(
      `GUARDRAIL: Blocked click on "${text.trim()}". ` +
        `Add to config.guardrails.allowList to override.`,
    );
  }

  await element.click();
}

async function safeNavigate(page: Page, url: string, baseUrl: string): Promise<void> {
  const targetOrigin = new URL(url).origin;
  const allowedOrigin = new URL(baseUrl).origin;
  if (targetOrigin !== allowedOrigin) {
    throw new Error(`GUARDRAIL: Navigation outside baseUrl not allowed. Target: ${url}`);
  }
  await page.goto(url);
}
```

**Config override:** `config.guardrails.allowList: ["#delete-test-item-btn"]` — bypass cho selector cụ thể.

---

### 11.14 SPA delay handling _(kế thừa v3)_

**Vấn đề:** React, Next.js, Vue render không đồng bộ. `browser_get_dom` ngay sau click có thể trả về DOM cũ.

**Giải pháp:** `actions.ts` đọc wait timing từ Profiler profile, không hardcode.

```typescript
// browser/actions.ts
async function clickAndWait(page: Page, selector: string, profile: ModelProfile): Promise<void> {
  await safeClick(page, selector);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(profile.spaWaitMs); // 300 / 400 / 600 theo Tier
  await page.waitForLoadState('domcontentloaded').catch(() => {});
}

async function fillAndWait(
  page: Page,
  selector: string,
  value: string,
  profile: ModelProfile,
): Promise<void> {
  await page.fill(selector, value);
  await page.waitForTimeout(profile.spaFillWaitMs); // 100 / 150 / 250 theo Tier
}
```

**Config override:** `browser.spaWaitMs` và `browser.spaFillWaitMs` trong config thắng Profiler nếu được set — cho phép điều chỉnh theo đặc thù app (animation nặng cần wait dài hơn).

---

### 11.15 iFrame + Shadow DOM support _(kế thừa v3)_

**Vấn đề:** `browser_get_dom` mặc định chỉ quét main frame. Bug trong Stripe iFrame, VNPay, hoặc Web Components sẽ vô hình với Agent.

**Giải pháp:** `dom.ts` đệ quy qua tất cả frames và pierce Shadow DOM. Giới hạn số element từ Profiler profile.

```typescript
// browser/dom.ts
async function extractInteractiveElements(
  page: Page,
  domElementLimit: number, // từ agentProfiles.explorer.domElementLimit
): Promise<InteractiveElement[]> {
  const results: InteractiveElement[] = [];

  // Main frame
  const mainElements = await extractFromFrame(page.mainFrame(), 'main');
  results.push(...mainElements);

  // iFrames
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      const frameUrl = frame.url();
      const frameElements = await extractFromFrame(frame, frameUrl);
      results.push(
        ...frameElements.map((el) => ({
          ...el,
          frameId: frameUrl,
          selector: `frame[src="${frameUrl}"] >> ${el.selector}`,
        })),
      );
    } catch {
      // Frame có thể bị cross-origin, bỏ qua
    }
  }

  return results.slice(0, domElementLimit); // 40 / 80 / 150 theo Tier
}
```

Element trong iFrame được đánh dấu `frameId` để Explorer switch frame đúng khi click.

---

### 11.16 Token budget + context overflow _(kế thừa v3)_

**Vấn đề:** Evidence array và browserTaskResults tăng theo mỗi iteration. Vượt context window → LLM hallucinate hoặc drop instruction.

**Giải pháp:** `llm-client.ts` kiểm tra token budget trước mỗi call. Ngưỡng từ Profiler profile.

```typescript
// agent/llm-client.ts
function trimToTokenBudget(messages: Message[], agentProfile: ModelProfile): Message[] {
  const contextWindow = getContextWindowSize(agentProfile);
  const budget = Math.floor(contextWindow * agentProfile.tokenBudgetRatio);
  const estimated = estimateTokens(messages); // js-tiktoken

  if (estimated <= budget) return messages;

  eventBus.emit({
    type: 'warning',
    message: `Token budget exceeded (${estimated} > ${budget}), trimming...`,
  });

  // Trim order: old evidence → old network logs → old browserTaskResults
  return trimEvidenceFromMessages(messages, budget);
}
```

Tier 1: 85% budget. Tier 2: 75%. Tier 3: 60%.

---

### 11.17 Malformed tool calls _(kế thừa v3)_

**Vấn đề:** Nhiều LLM provider trả về tool call JSON không chuẩn — syntax error, missing quotes, trailing comma.

**Giải pháp:** `tool-parser.ts` fallback chain:

```typescript
// agent/tool-parser.ts
function parseToolCall(raw: string): ToolCall {
  // 1. Parse JSON trực tiếp
  try {
    return JSON.parse(raw);
  } catch {}

  // 2. Partial JSON parser (partial-json package)
  try {
    return partialParse(raw);
  } catch {}

  // 3. Regex extract JSON block
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  // 4. Give up — return empty + warning
  eventBus.emit({
    type: 'warning',
    message: `Malformed tool call, skipping: ${raw.slice(0, 100)}`,
  });
  return { name: 'unknown', arguments: {} };
}
```

Đảm bảo investigation loop không crash vì một tool call lỗi.

---

### 11.18 Report Registry + Dedup _(kế thừa v3)_

**Registry schema** (lowdb):

```typescript
// reporter/registry.ts
interface ReportEntry {
  id: string;
  timestamp: string;
  url: string;
  hint: string;
  severity: string;
  rootCause: string;
  reportPath: string;
  models: {
    investigator: string;
    scout: string;
  };
}
```

**Duplicate detection** (Jaro-Winkler vía `natural`):

```typescript
function checkDuplicate(hint: string, url: string, config: Config): ReportEntry | null {
  const registry = loadRegistry();
  const threshold = config.output.deduplicationThreshold ?? 0.85;

  return (
    registry.reports.find((r) => r.url === url && similarity(r.hint, hint) > threshold) ?? null
  );
}
```

**CLI commands:**

```bash
ai-debug list                         # tất cả reports
ai-debug list --severity critical     # lọc theo severity
ai-debug list --url "/cart"            # lọc theo URL
ai-debug open --latest                # mở report gần nhất
```

---

### 11.19 Checkpointer — MemorySaver vs SqliteSaver _(kế thừa v3)_

```typescript
// graph/checkpointer.ts
import { MemorySaver } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph/checkpoint/sqlite';

export function createCheckpointer(env: string) {
  if (env === 'production') {
    return new SqliteSaver('./debug-reports/checkpoints.db');
  }
  return new MemorySaver();
}
```

|                     | MemorySaver   | SqliteSaver          |
| ------------------- | ------------- | -------------------- |
| Storage             | RAM           | File `.db` trên disk |
| Persist sau restart | ❌            | ✅                   |
| Dùng khi            | Dev / testing | Production           |

**Resume sau crash:**

```typescript
const lastState = await compiledGraph.getState({ configurable: { thread_id: threadId } });
if (lastState && lastState.values.status !== 'done') {
  console.log('Resuming from checkpoint...');
  await compiledGraph.invoke(null, { configurable: { thread_id: threadId } });
}
```

---

### 11.20 Evidence Sufficiency Criteria

Investigator cần tiêu chí rõ ràng để quyết định khi nào evidence "đủ" để kết luận — không dựa vào cảm tính.

**Confidence thresholds:**

| Confidence  | Status      | Ý nghĩa                                   |
| ----------- | ----------- | ----------------------------------------- |
| ≥ 0.85      | `confirmed` | Đủ evidence, kết luận chắc chắn           |
| 0.50 – 0.84 | `partial`   | Có dấu hiệu nhưng chưa đủ — cần test thêm |
| < 0.50      | `weak`      | Hypothesis yếu — deprioritize             |

**Minimum evidence requirements cho `confirmed`:**

```typescript
// graph/nodes/investigator.ts
function isEvidenceSufficient(hypothesis: Hypothesis, evidence: Evidence[]): boolean {
  const relatedEvidence = evidence.filter((e) => e.hypothesisId === hypothesis.id);

  // Rule 1: Ít nhất 2 evidence types khác nhau
  const types = new Set(relatedEvidence.map((e) => e.category));
  // categories: 'network' | 'console' | 'dom' | 'source' | 'user_input'
  if (types.size < 2) return false;

  // Rule 2: Bug phải được observe trực tiếp ít nhất 1 lần
  const hasDirectObservation = relatedEvidence.some(
    (e) => e.type === 'network_error' || e.type === 'console_error' || e.type === 'dom_anomaly',
  );
  if (!hasDirectObservation) return false;

  // Rule 3: Confidence threshold
  if (hypothesis.confidence < 0.85) return false;

  return true;
}
```

**Cannot-determine threshold:**

```typescript
function shouldGiveUp(state: AgentState): boolean {
  const iterationRatio = state.iterationCount / state.maxIterations;
  const maxConfidence = Math.max(...state.hypotheses.map((h) => h.confidence), 0);

  // Sau 60% iterations mà max confidence < 0.5 → give up
  if (iterationRatio >= 0.6 && maxConfidence < 0.5) {
    return true;
  }

  // Tất cả hypotheses bị refuted
  if (state.hypotheses.length > 0 && state.hypotheses.every((h) => h.status === 'refuted')) {
    return true;
  }

  return false;
}
```

**Behavior khi give up:**

- Set `status = 'cannot_determine'`
- Report vẫn sinh — nhưng ghi rõ "Root cause chưa xác định. Dưới đây là evidence thu thập được và các hướng đã thử."
- Tất cả hypotheses + evidence vẫn nằm trong report để developer tiếp tục manual

**Inject vào system prompt:**

Investigator system prompt chứa tiêu chí này để LLM calibrate confidence đúng:

```
Confidence calibration:
- 0.85+ = bạn có ≥2 loại evidence (network + console, console + source, etc.) VÀ đã observe bug trực tiếp
- 0.50-0.84 = có dấu hiệu nhưng chưa đủ cross-reference
- <0.50 = chỉ là phỏng đoán, chưa có evidence trực tiếp
Đừng tự tin quá mức. Nếu chỉ có 1 console error mà không có network evidence, confidence không nên vượt 0.70.
```

---

## 12. Auth Flow

Kế thừa từ v3.x — form-based và cookie-based. Xem section 11 trong spec v3.3.

Thêm v4.0: Nếu Scout phát hiện redirect về login page, tự động trigger auth flow trước khi investigation tiếp tục — không cần user config `auth.enabled = true` thủ công.

```typescript
// graph/nodes/scout.ts
// Sau khi navigate:
if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
  // Tự động detect cần auth
  if (config.auth.credentials) {
    await performLogin(config.auth);
  } else {
    // Hỏi user cung cấp credentials
    return {
      status: 'needs_user_input',
      pendingQuestion: 'Page yêu cầu login. Bạn có thể cung cấp credentials không?',
    };
  }
}
```

---

## 13. Cấu trúc thư mục

```
ai-debug-agent/
│
├── api/
│   ├── server.ts                ← Hono REST server
│   ├── routes/
│   │   ├── investigate.ts
│   │   └── reports.ts
│   └── middleware/
│       └── auth.ts              ← API key auth (nếu deploy public)
│
├── mcp-server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── tools/
│   │   │   ├── registry.ts
│   │   │   ├── navigate.ts
│   │   │   ├── get-dom.ts
│   │   │   ├── click.ts
│   │   │   ├── fill.ts
│   │   │   ├── select.ts
│   │   │   ├── upload-file.ts
│   │   │   ├── scroll.ts
│   │   │   ├── hover.ts
│   │   │   ├── wait.ts
│   │   │   ├── screenshot.ts
│   │   │   ├── get-console-logs.ts
│   │   │   ├── get-network-logs.ts
│   │   │   ├── get-network-payload.ts
│   │   │   ├── dispatch-browser-task.ts    ← MỚI v4.0.3
│   │   │   ├── fetch-source-map.ts
│   │   │   ├── resolve-error-location.ts ← MỚI v4.0
│   │   │   ├── read-source-file.ts     ← MỚI v4.0
│   │   │   └── ask-user.ts             ← MỚI v4.0
│   │   ├── browser/
│   │   │   ├── browser.ts
│   │   │   ├── actions.ts
│   │   │   ├── collector.ts
│   │   │   └── dom.ts
│   │   ├── sourcemap/
│   │   │   ├── fetcher.ts
│   │   │   ├── resolver.ts
│   │   │   ├── reader.ts
│   │   │   ├── tracer.ts               ← MỚI v4.0.2: import chain tracing
│   │   │   └── fallback.ts             ← MỚI v4.0.2: minified bundle analysis
│   │   └── types/
│   │       └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── mcp-client/
│   ├── src/
│   │   ├── index.ts
│   │   ├── graph/
│   │   │   ├── index.ts
│   │   │   ├── state.ts
│   │   │   ├── nodes/
│   │   │   │   ├── preflight.ts
│   │   │   │   ├── scout.ts                ← Data collection only
│   │   │   │   ├── investigator.ts          ← LLM reasoning loop only
│   │   │   │   ├── explorer.ts              ← LLM ReAct browser loop only
│   │   │   │   ├── source-map.ts
│   │   │   │   ├── ask-user.ts
│   │   │   │   ├── synthesis.ts              ← Report generation only
│   │   │   │   ├── evidence.ts              ← v4.1.1: shared evidence factories
│   │   │   │   ├── dom-parser.ts            ← v4.1.1: DOM interactive element extraction
│   │   │   │   ├── explorer-tools.ts        ← v4.1.1: Explorer tool definitions
│   │   │   │   ├── investigator-tools.ts     ← v4.1.1: Investigator tool definitions
│   │   │   │   └── tool-call-tracker.ts      ← v4.1.1: Tool call deduplication
│   │   │   └── checkpointer.ts
│   │   ├── agent/
│   │   │   ├── llm-client.ts
│   │   │   ├── tool-parser.ts
│   │   │   ├── config-loader.ts
│   │   │   └── prompts.ts               ← ALL system prompts + message builders
│   │   ├── model/
│   │   │   └── profiler.ts
│   │   ├── auth/
│   │   │   └── login.ts
│   │   ├── observability/
│   │   │   ├── event-bus.ts
│   │   │   ├── investigation-logger.ts
│   │   │   ├── logger.ts
│   │   │   └── step-aggregator.ts
│   │   └── reporter/
│   │       ├── report.ts
│   │       └── registry.ts
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                              ← Types, constants, enums
│   ├── domain.ts
│   ├── agent.ts
│   ├── tool-names.ts
│   ├── schemas.ts
│   ├── bug-patterns.ts
│   └── skill-types.ts
│
├── tests/
│   ├── unit/
│   │   ├── profiler.test.ts
│   │   ├── tool-parser.test.ts
│   │   ├── sourcemap-resolver.test.ts  ← MỚI v4.0
│   │   ├── hypothesis-engine.test.ts   ← MỚI v4.0
│   │   └── similarity.test.ts
│   ├── integration/
│   │   ├── fixture-upload-413.test.ts
│   │   ├── fixture-form-500.test.ts
│   │   ├── fixture-cart-missing-field.test.ts  ← MỚI v4.0
│   │   └── fixture-sourcemap.test.ts   ← MỚI v4.0
│   └── mocks/
│       ├── playwright.ts
│       └── llm.ts
│
├── vitest.config.ts
├── debug-reports/
├── ai-debug.config.json
├── ai-debug.config.example.json
├── package.json
└── README.md
```

---

## 14. Dependencies

### Thêm mới trong v4.0

```json
{
  "dependencies": {
    "source-map": "^0.7.0", // Parse + resolve source maps (Mozilla)
    "readline": "built-in" // Node.js built-in — ask_user terminal input
  }
}
```

**Bảng đầy đủ:**

| Package                                    | Vai trò                                        |
| ------------------------------------------ | ---------------------------------------------- |
| `@modelcontextprotocol/sdk`                | MCP protocol                                   |
| `playwright`                               | Headless browser                               |
| `zod`                                      | Schema validation                              |
| `openai`                                   | LLM client                                     |
| `@langchain/langgraph` + `@langchain/core` | Investigation graph + checkpointing            |
| `better-sqlite3`                           | LangGraph SqliteSaver                          |
| `source-map`                               | Parse + resolve source maps                    |
| `ink` + `react`                            | TUI dashboard (optional, local dev only)       |
| `hono`                                     | REST API server (lightweight, edge-compatible) |
| `commander`                                | CLI wrapper (optional, local dev only)         |
| `js-tiktoken`                              | Token counting chính xác                       |
| `p-retry`                                  | LLM retry                                      |
| `partial-json`                             | Stream JSON parsing                            |
| `lowdb`                                    | Atomic report registry                         |
| `signal-exit`                              | Graceful shutdown                              |
| `natural`                                  | Jaro-Winkler dedup                             |
| `pino`                                     | JSONL logging                                  |
| `vitest`                                   | Test framework                                 |
| `dotenv`                                   | Env vars                                       |

---

## 15. Roadmap

### v3.x — Foundation (hoàn thành)

- [x] Multi-Agent (Explorer + Analyzer + Reporter)
- [x] LangGraph orchestration + checkpointing
- [x] Model-agnostic + Multi-Model Routing
- [x] Model Auto-Profiler (Tier 1/2/3)
- [x] Observability (EventBus + ink TUI + pino JSONL)
- [x] Battle-tested libraries (p-retry, partial-json, lowdb, signal-exit, natural, js-tiktoken)
- [x] Auth strategies (form + cookie)
- [x] Vitest

### v4.0 — Investigation-First (base)

- [ ] Scout Node — baseline observation
- [ ] Investigator Node — hypothesis-driven loop
- [ ] Source Map Node — fetch + resolve + read source
- [ ] Ask User Node — interrupt flow ở `interactive` mode
- [ ] Synthesis Node — root cause + code location + suggested fix
- [ ] Investigation Mode — `interactive` / `autonomous`
- [ ] `--mode` CLI flag + `agent.mode` config field
- [ ] `get_network_payload`, `fetch_source_map`, `resolve_error_location`, `read_source_file`, `ask_user` tools

### v4.0.3 — Antigravity Browser Subagent

| Item                                      | Acceptance Criteria                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explorer Node                             | Nhận `BrowserTask`, thực thi browser actions, trả `BrowserTaskResult`. Browser session giữ nguyên qua `ReusedSubagentId` xuyên suốt investigation |
| `dispatch_browser_task` tool              | Investigator gọi → Explorer nhận task → kết quả inject vào state.evidence                                                                         |
| `BrowserTask` / `BrowserTaskResult` types | Zod validated. Task chứa `task` + `lookFor` + `stopCondition`. Result chứa `observations` + `networkActivity` + `consoleActivity`                 |
| System prompts                            | Investigator không gọi browser tools trực tiếp (blocked). Explorer không phân tích (chỉ báo cáo)                                                  |
| Tool access control                       | Browser tools → 403 nếu Investigator gọi. Analysis tools → 403 nếu Explorer gọi                                                                   |
| Hypothesis tracking                       | Confidence cập nhật sau mỗi evidence. Render trong SSE stream với status (untested/testing/confirmed/refuted/partial)                             |
| Report v4.0                               | Có sections: Root Cause, Code Location, Data Flow, Suggested Fix, Hypotheses Investigated, Repro Steps, Evidence                                  |
| Fixture test                              | `cart-missing-field` bug: chạy investigation → report xác định đúng `productId` missing + `AddToCartButton.tsx:67`                                |

### v4.1 — Service Architecture

| Item                                  | Acceptance Criteria                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| REST API `POST /investigate`          | Nhận `InvestigationRequest` → trả `{ threadId, status: 'started' }`. Invalid request → 400 + Zod error |
| REST API `GET /investigate/:threadId` | Trả current state: status, hypotheses, evidence count, finalReport (nếu done)                          |
| REST API SSE stream                   | Client nhận `InvestigationStep` events realtime. Connection đóng khi investigation complete            |
| MCP `investigate_bug`                 | MCP client gọi → nhận `notifications/message` progress → nhận final report JSON                        |
| `InvestigationRequestSchema`          | Shared giữa MCP + REST. Zod validated. Hỗ trợ request-level config override                            |
| Config precedence                     | request > env > file > defaults. Verified bằng test: request override thắng env                        |
| `callbackUrl`                         | POST question → đợi answer (timeout 5m). Không có callbackUrl → auto-assume                            |
| SSE + EventBus                        | EventBus emit → StepAggregator transform → filter by streamLevel → SSE write                           |
| CLI wrapper                           | `ai-debug run` gọi REST API. `ai-debug serve` start Hono server                                        |
| API key auth                          | `X-API-Key` header. Missing/invalid → 401                                                              |

### v5.0 — CI/CD Integration

- [ ] Exit code khác 0 khi tìm thấy bug
- [ ] `--format json` output machine-readable
- [ ] GitHub Action workflow example
- [ ] Webhook integration (Slack, Discord, Teams)

---

_Specifications v4.1.1 — AI Debug Agent_
_Stack: LangGraph.js + MCP + Hono + OpenAI-compatible SDK + Playwright + source-map + pino + TypeScript_
_v4.0: Investigation-First — Pre-flight → Scout → Hypothesize → [Investigator ↔ Explorer] → Source Map → Synthesize_
_v4.0.1: Investigation Mode — interactive / autonomous_
_v4.0.2: Pre-flight clarification, Import chain tracing, Source map fallback, Bug Pattern Catalogue_
_v4.0.3: Antigravity Browser Subagent — Investigator (Tier 1) viết BrowserTask, Explorer (Tier 2) thực thi one-shot qua ReusedSubagentId_
_v4.1: Service Architecture — MCP + REST dual interface, SSE streaming, callbackUrl for cloud ask_user_
_v4.1.1: SRP refactoring — extracted tool defs, evidence, dom-parser, tool-call-tracker. Removed fixture-app._
