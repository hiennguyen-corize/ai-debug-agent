# AI Debug Agent — Project Specifications v3.2.1

> **Mục tiêu:** CLI tool chạy local, dùng **Multi-Agent** kết hợp MCP Server + Headless Browser để tự động tái hiện bất kỳ loại bug nào trên web app và sinh ra báo cáo debug chi tiết. Hỗ trợ mọi LLM provider (OpenAI, Anthropic, Google, Deepseek, Ollama...) thông qua OpenAI-compatible API.

> **Changelog v2.0:** Multi-Agent Architecture (Explorer + Analyzer + Reporter), Hard-coded Guardrails, SPA/Hydration delay handling, iFrame/Shadow DOM support, Memory Compression.
>
> **Changelog v2.1:** Antigravity Browser Subagent pattern — Explorer chuyển sang one-shot BrowserTask dispatch, `ReusedSubagentId` để resume session, WebP video recording.
>
> **Changelog v3.0:** Model-agnostic — hỗ trợ mọi LLM provider. Loại bỏ các workaround thiết kế cho model yếu.
>
> **Changelog v3.1:** Thay thế self-implemented orchestrator bằng **LangGraph.js** — built-in checkpointing, MemorySaver, SqliteSaver, conditional routing. Loại bỏ `compressor.ts` và `shared-state.ts` tự viết.
>
> **Changelog v3.2:** Multi-Model Routing — mỗi Agent dùng model riêng phù hợp với vai trò (Right Model for the Right Task). Model Auto-Profiler — tự động phân loại model thành 3 Tier và override các thông số hệ thống để bảo vệ model nhỏ khỏi bị "ngợp" context. Cập nhật TUI Dashboard phản ánh cấu hình đa model và thông số auto-tuned.
>
> **Changelog v3.2.1:** Loại bỏ toàn bộ hardcode còn sót lại sau v3.2 — `dom.ts` element limit lấy từ Profiler thay vì `slice(0, 50)` cứng; `maybeCompress` đọc threshold từ Profiler thay vì hằng số `COMPRESS_THRESHOLD`; SPA wait timing đưa vào config `browser.spaWaitMs`; LLM retry config `agent.maxRetries` + `agent.retryBaseDelayMs`; duplicate detection threshold đưa vào `output.deduplicationThreshold`.

---

## 1. Tổng quan dự án

### 1.1 Vấn đề cần giải quyết

Developer khi gặp bug phải thủ công: mở browser → thao tác → đọc console → đọc network tab → đoán nguyên nhân. Quá trình này lặp đi lặp lại, mất thời gian và đòi hỏi context switching liên tục.

**AI Debug Agent** tự động hoá toàn bộ quy trình trên. Developer chỉ cần mô tả ngắn gọn chức năng đang lỗi — Agent tự suy luận flow thao tác phù hợp, tái hiện bug, thu thập evidence và đưa ra phân tích.

### 1.2 Triết lý thiết kế

- **Tuân theo chuẩn MCP** — MCP Server có thể tái sử dụng với bất kỳ MCP client hoặc LLM nào
- **Model-agnostic** — hoạt động với bất kỳ LLM provider nào hỗ trợ OpenAI-compatible API
- **Right Model for the Right Task** — phân tầng model theo vai trò Agent, không dùng model "khủng" cho tác vụ đơn giản
- **Mô tả tự nhiên, không cần chỉ định từng bước** — "Chức năng upload ảnh bị lỗi" là đủ
- **Chia để trị** — mỗi Agent chỉ làm một việc, ranh giới trách nhiệm rõ ràng
- **Thu thập evidence trước, phân tích sau** — gom đủ dữ liệu rồi mới kết luận
- **Không phá vỡ dữ liệu** — bảo vệ cứng ở tầng code, không phụ thuộc vào prompt
- **Auto-protect model nhỏ** — Model Profiler tự động điều chỉnh thông số hệ thống để mọi model, dù nhỏ hay lớn, đều hoạt động ổn định
- **Zero magic numbers** — mọi thông số runtime (timeout, threshold, limit, wait timing) đều có nguồn gốc rõ ràng: từ config người dùng hoặc từ Profiler theo Tier; không có hằng số cứng ẩn trong business logic

### 1.3 Phạm vi v3

**Có trong v3:**

- MCP Server expose browser tools theo chuẩn MCP protocol
- **Multi-Agent Architecture:** Explorer Agent, Analyzer Agent, Reporter Agent
- **State Graph Orchestration** quản lý luồng và SharedState
- **One-shot BrowserTask dispatch** — Analyzer viết `BrowserTask` trọn gói, Explorer thực thi và báo cáo
- **ReusedSubagentId** — resume browser session xuyên suốt các task, không cần login lại
- **WebP video recording** — tự động ghi toàn bộ browser session
- **Hard-coded Guardrails** trong `actions.ts` — chặn cứng actions nguy hiểm
- **SPA/Hydration handling** — đợi DOM ổn định sau mỗi action
- **iFrame & Shadow DOM support** — quét đệ quy qua các frames
- **Memory Compression** — tóm tắt history cũ để tránh bloat context
- **Model-agnostic** — config chọn provider + model, mặc định Ollama để chạy local
- **Multi-Model Routing** — mỗi Agent dùng model riêng tối ưu cho vai trò của nó *(v3.2)*
- **Model Auto-Profiler** — tự động phân loại model, override thông số hệ thống phù hợp *(v3.2)*
- Tự động login nếu app yêu cầu auth
- Hỗ trợ nhiều bug pattern phổ biến
- Detect lỗi: console errors, network 4xx/5xx, JS exceptions
- Stream log realtime ra terminal
- Export bug report Markdown + recording

---

## 2. Kiến trúc tổng thể

### 2.1 Sơ đồ hệ thống — Multi-Agent

```
┌─────────────────────────────────────────────────────────────────┐
│                           Developer                             │
│        ai-debug run -u "/cart" -t "thêm giỏ hàng lỗi"          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
               ┌───────────▼────────────────────────┐
               │         mcp-client/                 │
               │                                     │
               │  ┌─────────────────────────────┐   │
               │  │      Orchestrator            │   │
               │  │   (State Graph Manager)      │   │
               │  └────┬──────────┬────────┬────┘   │
               │       │          │        │         │
               │  ┌────▼───┐ ┌───▼───┐ ┌──▼──────┐ │
               │  │Explorer│ │Analyz-│ │Reporter │ │
               │  │ Agent  │ │  er   │ │  Agent  │ │
               │  │        │ │ Agent │ │         │ │
               │  │Model:  │ │Model: │ │Model:   │ │
               │  │Tier 2  │ │Tier 1 │ │Tier 3   │ │
               │  │(Fast)  │ │(Smart)│ │(Local)  │ │
               │  └────┬───┘ └───┬───┘ └──┬──────┘ │
               │       │   MCP   │        │         │
               └───────┼─────────┼────────┼─────────┘
                       │         │        │
               ┌───────▼─────────▼────────▼─────────┐
               │            mcp-server/              │
               │                                     │
               │  ┌──────────────────────────────┐  │
               │  │         Tool Router          │  │
               │  └──────────────┬───────────────┘  │
               │                 │                   │
               │  ┌──────────────▼───────────────┐  │
               │  │        Browser Engine        │  │
               │  │         (Playwright)         │  │
               │  │                              │  │
               │  │ - actions (+ guardrails)     │  │
               │  │ - collector                  │  │
               │  │ - dom extractor (+ iFrame)   │  │
               │  └──────────────────────────────┘  │
               └─────────────────────────────────────┘
                                 │
               ┌─────────────────▼───────────────────┐
               │            Output Layer             │
               │   Terminal Stream  │  Markdown Report│
               └─────────────────────────────────────┘
```

### 2.2 Luồng giao tiếp — One-shot BrowserTask Dispatch

```
1. Developer chạy CLI
        │
2. Orchestrator khởi động MCP Server (subprocess)
        │
3. [MODEL PROFILER] Phân loại model → override thông số hệ thống   ← MỚI v3.2
        │
4. Orchestrator khởi tạo SharedState
        │
5. [AUTH NODE] Auto-login → lưu subagentId vào SharedState
        │
6. [ANALYZER NODE] Nhận task → suy luận strategy → viết BrowserTask đầy đủ
        │  (dùng Tier 1 model — reasoning mạnh)
        │
        │  BrowserTask {
        │    TaskName:        "Testing Avatar Upload",
        │    Task:            "1. Navigate to /settings\n2. Find input[type=file]...\n
        │                      ...7. Return: network status, console errors",
        │    TaskSummary:     "Upload avatar với file 2MB",
        │    RecordingName:   "avatar_upload_test",
        │    ReusedSubagentId: "<id từ bước auth>"   ← giữ session
        │  }
        │
7. [EXPLORER NODE] Nhận BrowserTask → thực thi one-shot → báo cáo kết quả
        │   (dùng Tier 2 model — phản hồi nhanh, chỉ thực thi tool call)
        │   (navigate → get_dom → upload → wait → screenshot → return report)
        │
8. [ANALYZER NODE] Đọc kết quả Explorer + gọi browser_get_logs
        │
        ├── Chưa đủ evidence → viết BrowserTask mới, dispatch lại
        │
        └── Đủ evidence → gọi finish_analysis
        │
9. [REPORTER NODE] Nhận evidence → sinh Markdown + đính kèm WebP recording
        │   (dùng Tier 3 model — format markdown, tiết kiệm tài nguyên)
        │
10. Kết thúc — lưu file, hiển thị đường dẫn
```

---

## 3. Cấu trúc thư mục

```
ai-debug-agent/
│
├── mcp-server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── tools/
│   │   │   ├── registry.ts
│   │   │   ├── navigate.ts
│   │   │   ├── get-dom.ts          # ← nâng cấp: iFrame + Shadow DOM
│   │   │   ├── click.ts
│   │   │   ├── fill.ts
│   │   │   ├── select.ts
│   │   │   ├── upload-file.ts
│   │   │   ├── scroll.ts
│   │   │   ├── hover.ts
│   │   │   ├── wait.ts
│   │   │   ├── get-logs.ts
│   │   │   ├── screenshot.ts
│   │   │   └── finish-analysis.ts
│   │   ├── browser/
│   │   │   ├── browser.ts
│   │   │   ├── actions.ts          # ← nâng cấp: guardrails + SPA wait
│   │   │   ├── collector.ts
│   │   │   └── dom.ts              # ← nâng cấp: frame recursion
│   │   └── types/
│   │       └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── mcp-client/
│   ├── src/
│   │   ├── index.ts
│   │   ├── graph/
│   │   │   ├── index.ts            # ← StateGraph definition + compile
│   │   │   ├── state.ts            # ← Annotation.Root schema (thay SharedState)
│   │   │   ├── nodes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── analyzer.ts
│   │   │   │   ├── explorer.ts
│   │   │   │   └── reporter.ts
│   │   │   └── checkpointer.ts     # ← MemorySaver / SqliteSaver config
│   │   ├── agents/
│   │   │   ├── explorer-agent.ts
│   │   │   ├── analyzer-agent.ts
│   │   │   └── reporter-agent.ts
│   │   ├── agent/
│   │   │   ├── llm-client.ts       # ← nâng cấp: per-agent model routing
│   │   │   ├── tool-parser.ts
│   │   │   └── prompts.ts
│   │   ├── model/
│   │   │   └── profiler.ts         # ← MỚI v3.2: Model Auto-Profiler
│   │   ├── browser-task/
│   │   │   ├── types.ts
│   │   │   └── recorder.ts
│   │   ├── auth/
│   │   │   └── login.ts
│   │   ├── observability/
│   │   │   ├── tui.tsx             # ← nâng cấp: multi-model display
│   │   │   ├── event-bus.ts
│   │   │   └── debug-logger.ts
│   │   └── reporter/
│   │       ├── stream.ts
│   │       └── report.ts
│   ├── package.json
│   └── tsconfig.json
│
├── shared/
│   └── types.ts               # ← FinishAnalysisSchema (Zod) dùng chung
│
├── fixture-app/               # ← Integration test app
│   ├── server.ts
│   ├── public/index.html
│   └── bugs/
│       ├── upload-413.ts
│       ├── form-500.ts
│       ├── null-render.ts
│       ├── double-submit.ts
│       └── auth-redirect.ts
│
├── debug-reports/
├── ai-debug.config.json
├── ai-debug.config.example.json
├── package.json
└── README.md
```

---

## 4. MCP Server

`mcp-server` sử dụng `@modelcontextprotocol/sdk` để expose browser tools qua **stdio transport**. Mỗi tool được đăng ký với input schema dùng `zod`.

**Nâng cấp v2:** `actions.ts` có thêm guardrails layer và SPA wait logic. `dom.ts` hỗ trợ frame recursion.

---

## 5. Multi-Agent Architecture

### 5.1 BrowserTask — Interface dispatch từ Analyzer sang Explorer

Đây là schema trung tâm của Antigravity pattern. Mỗi lần Analyzer muốn Explorer làm gì, nó **viết một BrowserTask đầy đủ** — không phải chỉ thị ngắn gọn.

```typescript
// browser-task/types.ts
interface BrowserTask {
  TaskName: string;          // Tên human-readable, không chứa selector/URL thô
                             // Ví dụ: "Testing Avatar Upload Flow"

  Task: string;              // Prompt đầy đủ, tự chứa đủ context — vì Explorer
                             // không có memory. Phải bao gồm:
                             //   1. Các bước thực hiện (numbered list)
                             //   2. Stop condition: khi nào thì dừng
                             //   3. Return: thông tin gì cần báo cáo lại

  TaskSummary: string;       // 1-2 câu ngắn hiển thị trên terminal cho user

  RecordingName: string;     // Tên file WebP recording. Lowercase + underscore,
                             // tối đa 3 từ. Ví dụ: "avatar_upload_test"

  MediaPaths?: string[];     // Đường dẫn file media làm context (tối đa 3)
                             // Ví dụ: screenshot từ lần chạy trước

  ReusedSubagentId?: string; // ID session trước để resume (giữ login state,
                             // giữ vị trí trang). Rỗng = bắt đầu fresh.
}

interface BrowserTaskResult {
  subagentId: string;        // ID session vừa chạy — Analyzer lưu lại để reuse
  success: boolean;
  report: string;            // Báo cáo text từ Explorer: kết quả từng bước,
                             // DOM snapshot cuối, lỗi gặp phải
  recordingPath: string;     // Đường dẫn file WebP đã ghi
  screenshotPath?: string;   // Screenshot cuối session nếu có lỗi
}
```

**Ví dụ BrowserTask thực tế:**
```json
{
  "TaskName": "Testing Avatar Upload with 2MB JPEG",
  "Task": "1. The browser is already at /settings (reusing previous session)\n2. Call get_dom to locate the avatar upload section\n3. Find input[type='file'] near text 'Avatar' or 'Profile Photo'\n4. Upload a JPEG file of exactly 2MB using browser_upload_file\n5. Wait up to 5 seconds for network response\n6. If a success/error message appears, note its exact text\n7. STOP after the upload response is received (do not navigate away)\n8. Return: HTTP status of upload request, any console errors, any UI feedback message, current URL",
  "TaskSummary": "Upload ảnh avatar 2MB để kiểm tra giới hạn file size",
  "RecordingName": "avatar_upload_test",
  "MediaPaths": [],
  "ReusedSubagentId": "session_abc123"
}
```

### 5.2 LangGraph State — Annotation Schema

Thay thế `SharedState` interface tự viết bằng **LangGraph `Annotation.Root`**. LangGraph tự động pass state qua các nodes, persist qua checkpointer, và merge partial updates.

```typescript
// graph/state.ts
import { Annotation } from '@langchain/langgraph';

export const StateAnnotation = Annotation.Root({
  // Input
  task:        Annotation<string>(),
  targetUrl:   Annotation<string>(),
  baseUrl:     Annotation<string>(),

  // Session
  isAuthenticated:   Annotation<boolean>({ default: () => false }),
  currentSubagentId: Annotation<string>({ default: () => '' }),
  currentUrl:        Annotation<string>({ default: () => '' }),

  // BrowserTask history — LangGraph merge strategy: append
  browserTaskHistory: Annotation<BrowserTaskRecord[]>({
    default:  () => [],
    reducer:  (prev, next) => [...prev, ...next]  // tự động append, không overwrite
  }),

  // Summary từ compression — LangGraph merge strategy: replace
  compressedSummary: Annotation<string>({ default: () => '' }),

  // Evidence — append-only
  consoleErrors:  Annotation<string[]>({ default: () => [], reducer: (a, b) => [...a, ...b] }),
  networkErrors:  Annotation<NetworkError[]>({ default: () => [], reducer: (a, b) => [...a, ...b] }),
  recordingPaths: Annotation<string[]>({ default: () => [], reducer: (a, b) => [...a, ...b] }),

  // Control
  iterationCount: Annotation<number>({ default: () => 0 }),
  maxIterations:  Annotation<number>({ default: () => 20 }),
  status: Annotation<'running' | 'evidence_collected' | 'cannot_reproduce' | 'done'>({
    default: () => 'running'
  }),

  // Kết quả cuối
  analysisResult: Annotation<FinishAnalysisPayload | undefined>({ default: () => undefined })
});

export type AgentState = typeof StateAnnotation.State;
```

**Lợi ích so với `SharedState` tự viết:**

| | SharedState tự viết | LangGraph Annotation |
|---|---|---|
| Pass giữa nodes | Truyền tay qua params | Tự động |
| Merge updates | Tự xử lý | Khai báo `reducer` |
| Persist | Tự implement | Checkpointer built-in |
| Resume sau crash | Không có | Tự động từ checkpoint |
| Time-travel debug | Không có | Built-in |

### 5.3 Explorer Agent — One-shot BrowserTask Executor

**Nhiệm vụ:** Nhận một `BrowserTask` đầy đủ từ Analyzer, thực thi trọn gói, trả về `BrowserTaskResult`. Không hỏi lại, không quyết định thêm.

**Model được cấp:** Tier 2 (vd: `gemini-2.0-flash`, `gpt-4o-mini`) — phản hồi nhanh, chỉ cần thực thi tool call từ BrowserTask có sẵn, không cần reasoning phức tạp. *(v3.2)*

**Tools được cấp:** `browser_navigate`, `browser_get_dom`, `browser_click`, `browser_fill`, `browser_select`, `browser_upload_file`, `browser_scroll`, `browser_hover`, `browser_wait`, `browser_screenshot`

**Không có quyền:** `browser_get_logs`, `finish_analysis` (thuộc về Analyzer)

**Execution model:** One-shot — nhận task → thực thi → return. Không conversation loop.

**Session continuity:** Nếu `ReusedSubagentId` được cung cấp, Explorer resume browser session từ lần trước (giữ login state, giữ vị trí trang, giữ cookies). Nếu rỗng → bắt đầu fresh.

**Auto-recording:** Mọi thao tác đều được tự động ghi video WebP suốt session. Recording lưu vào `{reportsDir}/recordings/{RecordingName}-{timestamp}.webp`.

**Post-execution:** Sau khi Explorer return, Analyzer phải gọi `browser_get_logs` độc lập để đọc network + console logs — Explorer không tự đọc logs.

**System Prompt:**
```
Bạn là Explorer Agent — chuyên thực thi các thao tác UI trên trình duyệt.

NHIỆM VỤ: Thực hiện đúng và đủ các bước trong BrowserTask được giao.

QUY TẮC THỰC THI:
- Gọi browser_get_dom trước khi thao tác để lấy selector thực tế từ DOM
- Nếu không tìm thấy element: scroll → get_dom lại → thử hover menu/tab để reveal
- Chụp screenshot khi có lỗi visible trên UI
- Dừng đúng theo stop condition trong Task

KHI BÁO CÁO KẾT QUẢ:
- Liệt kê từng bước đã thực hiện và kết quả
- Ghi rõ các thông tin Return được yêu cầu trong Task
- Nếu một bước thất bại: mô tả chính xác lỗi gặp phải

TUYỆT ĐỐI KHÔNG:
- Phân tích nguyên nhân bug
- Gọi browser_get_logs
- Thực hiện thêm bước ngoài Task
```

---

### 5.4 Analyzer Agent — Bộ não + BrowserTask Writer

**Nhiệm vụ:** Suy luận về bug, **viết BrowserTask đầy đủ** để dispatch cho Explorer, đọc kết quả, quyết định khi nào kết thúc.

**Model được cấp:** Tier 1 (vd: `gpt-4o`, `claude-3.5-sonnet`) — reasoning mạnh, đọc log phức tạp, phân tích stack trace, viết BrowserTask đủ chi tiết. *(v3.2)*

**Tools được cấp:** `browser_get_logs`, `finish_analysis`

**Không có quyền truy cập:** Các browser action tools (chỉ Explorer mới có)

**Input:** SharedState hiện tại (status, `BrowserTaskResult` vừa nhận, evidence đã thu thập, `compressedSummary`)

**Output:** `BrowserTask` mới để dispatch cho Explorer, HOẶC gọi `finish_analysis`

**Trách nhiệm viết Task prompt:** Vì Explorer không có memory, Analyzer phải viết `Task` đủ chi tiết — bao gồm mục tiêu, từng bước, stop condition, và danh sách thông tin cần return. Đây là kỹ năng cốt lõi của Analyzer.

**System Prompt:**
```
Bạn là Analyzer Agent — bộ não của hệ thống debug.

VAI TRÒ: Suy luận về bug, viết BrowserTask cho Explorer, thu thập evidence.

QUY TRÌNH:
1. Đọc SharedState — xem BrowserTaskResult mới nhất và evidence đã có
2. Gọi browser_get_logs để kiểm tra console + network
3. Quyết định:
   a. Chưa đủ evidence → viết BrowserTask mới, dispatch cho Explorer
   b. Đủ evidence (console error / network 4xx/5xx) → gọi finish_analysis
   c. Đã thử hợp lý nhưng không tái hiện → finish_analysis với cannotReproduce=true

KHI VIẾT BROWSERTASK — Task phải tự chứa đủ thông tin vì Explorer không có memory:
  - Numbered list các bước cụ thể
  - Stop condition rõ ràng ("STOP after upload response received")
  - Return list chính xác ("Return: HTTP status, console errors, UI feedback")
  - Nếu reuse session: ghi rõ "Browser is already at /X (reusing previous session)"

TUYỆT ĐỐI KHÔNG:
- Dispatch Task y chang đã thất bại quá 3 lần
- Bỏ qua evidence rõ ràng để tiếp tục thao tác thêm
```

---

### 5.5 Reporter Agent — Người tổng hợp

**Nhiệm vụ:** Chạy một lần duy nhất ở cuối. Nhận `FinishAnalysisPayload` từ SharedState, sinh Markdown report đính kèm danh sách WebP recordings.

**Model được cấp:** Tier 3 (vd: `qwen2.5:7b` local) — format markdown từ dữ liệu có cấu trúc, không cần reasoning. Tiết kiệm tài nguyên và API cost. *(v3.2)*

**Không gọi bất kỳ tool nào** — chỉ xử lý data thuần túy.

**Lợi ích:** Format report luôn nhất quán. Giảm tải context cho Analyzer. Recordings WebP đính kèm trực tiếp vào report thay vì chỉ có screenshot tĩnh.

---

### 5.6 LangGraph StateGraph — Orchestration

Thay thế vòng lặp tự implement bằng `StateGraph`. Mỗi node là một async function nhận `AgentState` và trả partial state update.

```typescript
// graph/index.ts
import { StateGraph, END } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';

const graph = new StateGraph(StateAnnotation)
  .addNode('auth',     authNode)
  .addNode('analyzer', analyzerNode)
  .addNode('explorer', explorerNode)
  .addNode('reporter', reporterNode)

  // Entry point
  .addEdge('__start__', 'auth')
  .addEdge('auth', 'analyzer')

  // Conditional routing từ Analyzer
  .addConditionalEdges('analyzer', routeFromAnalyzer, {
    dispatch_task: 'explorer',
    finish:        'reporter',
    force_finish:  'reporter'   // khi đạt maxIterations
  })

  // Explorer luôn quay lại Analyzer
  .addEdge('explorer', 'analyzer')
  .addEdge('reporter', END);

// Checkpointer — MemorySaver cho dev, SqliteSaver cho production
const checkpointer = process.env.NODE_ENV === 'production'
  ? new SqliteSaver('./debug-reports/checkpoints.db')
  : new MemorySaver();

export const compiledGraph = graph.compile({ checkpointer });
```

**Routing function:**
```typescript
// graph/index.ts
function routeFromAnalyzer(state: AgentState): string {
  if (state.status === 'evidence_collected' || state.status === 'cannot_reproduce') {
    return 'finish';
  }
  if (state.iterationCount >= state.maxIterations) {
    return 'force_finish';
  }
  return 'dispatch_task';
}
```

**Node example — analyzerNode:**
```typescript
// graph/nodes/analyzer.ts
async function analyzerNode(state: AgentState): Promise<Partial<AgentState>> {
  const result = await runAnalyzer(state);

  // Trả về partial update — LangGraph tự merge vào state
  return {
    iterationCount: state.iterationCount + 1,
    status:         result.status,
    analysisResult: result.analysisResult,
    compressedSummary: maybeCompress(state)
  };
}
```

**Chạy graph:**
```typescript
// index.ts
const threadId = `debug-${Date.now()}`;

const stream = compiledGraph.stream(
  { task, targetUrl, baseUrl, maxIterations: config.agent.maxIterations },
  { configurable: { thread_id: threadId } }
);

for await (const event of stream) {
  eventBus.emit({ type: 'graph_event', event });
}
```

**Resume sau crash:**
```typescript
// Nếu process crash giữa chừng, resume từ checkpoint cuối
const lastState = await compiledGraph.getState({ configurable: { thread_id: threadId } });
if (lastState && lastState.values.status === 'running') {
  console.log('Resuming from checkpoint...');
  await compiledGraph.invoke(null, { configurable: { thread_id: threadId } });
}
```

**Memory: MemorySaver vs SqliteSaver:**

| | MemorySaver | SqliteSaver |
|---|---|---|
| Storage | RAM | File `.db` trên disk |
| Persist sau restart | ❌ | ✅ |
| Dùng khi | Dev / testing | Production |
| Setup | Zero config | `new SqliteSaver('./checkpoints.db')` |

---

## 6. Các nâng cấp kỹ thuật quan trọng

### 6.1 Hard-coded Guardrails — Bảo vệ tầng code

**Vấn đề:** Không thể phụ thuộc hoàn toàn vào LLM để tránh actions nguy hiểm — dù model mạnh đến đâu, guardrail ở tầng code vẫn là lớp bảo vệ cần thiết.

**Giải pháp:** Chặn cứng trong `actions.ts`, không phụ thuộc vào prompt.

```typescript
// actions.ts
const DANGEROUS_KEYWORDS = [
  'delete', 'remove', 'xoá', 'xoa', 'hủy', 'huy',
  'drop', 'reset', 'destroy', 'purge', 'clear all',
  'deactivate account', 'delete account'
];

async function safeClick(page: Page, selector: string): Promise<void> {
  const element = await page.$(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);

  const text = await element.textContent() ?? '';
  const ariaLabel = await element.getAttribute('aria-label') ?? '';
  const combined = `${text} ${ariaLabel}`.toLowerCase();

  const isDangerous = DANGEROUS_KEYWORDS.some(kw => combined.includes(kw));
  if (isDangerous) {
    throw new Error(
      `GUARDRAIL: Blocked click on potentially destructive element: "${text.trim()}". ` +
      `Add to config.guardrails.allowList to override.`
    );
  }

  await element.click();
}

async function safeNavigate(page: Page, url: string, baseUrl: string): Promise<void> {
  const targetOrigin = new URL(url).origin;
  const allowedOrigin = new URL(baseUrl).origin;
  if (targetOrigin !== allowedOrigin) {
    throw new Error(`GUARDRAIL: Navigation outside baseUrl is not allowed. Target: ${url}`);
  }
  await page.goto(url);
}
```

**Config override:**
```json
{
  "guardrails": {
    "allowList": ["#delete-test-item-btn"]
  }
}
```

---

### 6.2 SPA / Hydration Delay Handling

**Vấn đề:** React, Next.js, Vue... render không đồng bộ. `browser_get_dom` ngay sau click có thể trả về DOM cũ. Ngoài ra, model Tier 3 chạy local chậm hơn — cần wait lâu hơn để DOM kịp ổn định trước khi Agent đọc lại.

**Giải pháp:** `actions.ts` đọc wait timing từ config `browser.spaWaitMs` (set bởi Profiler theo Explorer Tier), không hardcode.

**Tier profile bổ sung `spaWaitMs`:**

```typescript
// model/profiler.ts — ModelProfile bổ sung field spaWaitMs
export interface ModelProfile {
  tier:              ModelTier;
  domElementLimit:   number;
  compressThreshold: number;
  tokenBudgetRatio:  number;
  taskTimeoutMs:     number;
  spaWaitMs:         number;   // ← MỚI v3.2.1: wait sau click để DOM ổn định
  spaFillWaitMs:     number;   // ← MỚI v3.2.1: wait sau fill (ngắn hơn click)
}

export const TIER_PROFILES: Record<ModelTier, ModelProfile> = {
  tier1: { ...tier1Base, spaWaitMs: 300,  spaFillWaitMs: 100 },
  tier2: { ...tier2Base, spaWaitMs: 400,  spaFillWaitMs: 150 },
  tier3: { ...tier3Base, spaWaitMs: 600,  spaFillWaitMs: 250 },
  //                     ↑ local model cần đợi lâu hơn để DOM commit
};
```

**`actions.ts` đọc từ profile, không hardcode:**

```typescript
// actions.ts
async function clickAndWait(
  page: Page,
  selector: string,
  profile: ModelProfile  // ← inject Explorer profile
): Promise<void> {
  await safeClick(page, selector);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(profile.spaWaitMs);    // 300 / 400 / 600 theo Tier
  await page.waitForLoadState('domcontentloaded').catch(() => {});
}

async function fillAndWait(
  page: Page,
  selector: string,
  value: string,
  profile: ModelProfile
): Promise<void> {
  await page.fill(selector, value);
  await page.waitForTimeout(profile.spaFillWaitMs); // 100 / 150 / 250 theo Tier
}
```

**Config override** (nếu app cụ thể cần wait dài hơn):

```json
{
  "browser": {
    "spaWaitMs":     500,
    "spaFillWaitMs": 200
  }
}
```

Khi có `browser.spaWaitMs`, giá trị này **thắng** Profiler — cho phép điều chỉnh theo đặc thù của app (vd: app dùng animation nặng cần wait dài hơn bất kể Tier).

---

### 6.3 iFrame & Shadow DOM Support

**Vấn đề:** `browser_get_dom` mặc định chỉ quét main frame. Bug trong Stripe iFrame, VNPay, hoặc Web Components sẽ vô hình với Agent.

**Giải pháp:** `dom.ts` đệ quy qua tất cả frames và pierce Shadow DOM. Giới hạn số element lấy từ **Explorer model profile** (Tier 1: 150, Tier 2: 80, Tier 3: 40) — không hardcode.

```typescript
// dom.ts
async function extractInteractiveElements(
  page: Page,
  domElementLimit: number  // ← inject từ agentProfiles.explorer.domElementLimit
): Promise<InteractiveElement[]> {
  const results: InteractiveElement[] = [];

  const mainElements = await extractFromFrame(page.mainFrame(), 'main');
  results.push(...mainElements);

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      const frameUrl = frame.url();
      const frameElements = await extractFromFrame(frame, frameUrl);
      results.push(...frameElements.map(el => ({
        ...el,
        frameId: frameUrl,
        selector: `frame[src="${frameUrl}"] >> ${el.selector}`
      })));
    } catch {
      // Frame có thể bị cross-origin, bỏ qua
    }
  }

  // Giới hạn từ Profiler: 40 / 80 / 150 theo Explorer Tier
  // KHÔNG dùng slice(0, 50) cứng
  return results.slice(0, domElementLimit);
}
```

**MCP tool `browser_get_dom` nhận limit qua context** — được set khi khởi tạo tool registry sau khi Profiler chạy xong:

```typescript
// tools/get-dom.ts
export function createGetDomTool(domElementLimit: number) {
  return {
    name: 'browser_get_dom',
    handler: async (page: Page) => {
      return extractInteractiveElements(page, domElementLimit);
    }
  };
}

// tools/registry.ts — khởi tạo sau Profiler
const domElementLimit = agentProfiles.explorer.domElementLimit;
registry.register(createGetDomTool(domElementLimit));
```
```

---

### 6.4 Memory Compression — Logic trong analyzerNode

**Vấn đề:** Sau nhiều vòng lặp, `browserTaskHistory` trở nên khổng lồ, tốn token khi đưa vào LLM context.

**Giải pháp với LangGraph:** Compression logic nằm trực tiếp trong `analyzerNode`. Ngưỡng compress lấy từ **Analyzer model profile** — không dùng hằng số `COMPRESS_THRESHOLD` cứng.

```typescript
// graph/nodes/analyzer.ts
function maybeCompress(
  state:   AgentState,
  profile: ModelProfile  // ← inject agentProfiles.analyzer
): string {
  const successfulTasks = state.browserTaskHistory.filter(t => t.result.success);
  const threshold = profile.compressThreshold; // 10 / 5 / 3 theo Tier — KHÔNG hardcode

  if (successfulTasks.length < threshold) {
    return state.compressedSummary;
  }

  const toCompress = successfulTasks.slice(0, threshold);
  const newLines = toCompress.map(t => `[${t.task.TaskName}] → OK`).join(' | ');

  return state.compressedSummary
    ? `${state.compressedSummary} | ${newLines}`
    : newLines;
}

// analyzerNode gọi với profile
async function analyzerNode(state: AgentState): Promise<Partial<AgentState>> {
  const result = await runAnalyzer(state);
  return {
    iterationCount:    state.iterationCount + 1,
    status:            result.status,
    analysisResult:    result.analysisResult,
    compressedSummary: maybeCompress(state, agentProfiles.analyzer)
  };
}
```

---

### 6.5 Selector Stability Score

**Vấn đề:** Explorer nhận selector từ `browser_get_dom` và dùng để click/fill. Nhưng không phải mọi selector đều như nhau — `#submit-btn` rất stable, còn `.css-1x2y3z > div:nth-child(3)` rất fragile.

**Giải pháp:** `dom.ts` gán `stabilityScore` cho mỗi element. Explorer ưu tiên selector có score cao nhất.

```typescript
// browser/dom.ts
function getStabilityScore(element: ElementHandle): { selector: string; score: number } {
  const strategies = [
    { attr: 'id',            score: 100, build: (v: string) => `#${v}` },
    { attr: 'data-testid',   score: 95,  build: (v: string) => `[data-testid="${v}"]` },
    { attr: 'data-cy',       score: 95,  build: (v: string) => `[data-cy="${v}"]` },
    { attr: 'name',          score: 80,  build: (v: string) => `[name="${v}"]` },
    { attr: 'aria-label',    score: 75,  build: (v: string) => `[aria-label="${v}"]` },
    { attr: 'type+role',     score: 60,  build: (v: string) => v },
    { attr: 'text-content',  score: 50,  build: (v: string) => `text="${v}"` },
    { attr: 'class',         score: 20,  build: (v: string) => `.${v.split(' ')[0]}` },
    { attr: 'nth-child',     score: 5,   build: (v: string) => v },
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

### 6.6 Browser Context Isolation

**Vấn đề:** Nếu chạy 2 instance song song, cả hai share cùng browser profile mặc định — cookies và localStorage có thể conflict.

**Giải pháp:** Mỗi run tạo một Playwright `BrowserContext` riêng biệt với `storageState` độc lập.

```typescript
// browser/browser.ts
async function createIsolatedContext(config: BrowserConfig): Promise<BrowserContext> {
  const browser = await chromium.launch({ headless: config.headless });

  const context = await browser.newContext({
    viewport:    config.viewport,
    recordVideo: config.output.includeRecording
      ? { dir: `${config.output.reportsDir}/recordings/` }
      : undefined,
  });

  return context;
}
```

---

### 6.7 Multi-Model Routing — Agent-Level LLM Configuration *(MỚI v3.2)*

**Vấn đề:** Dùng một model "khủng" (như GPT-4o hay Claude 3.5 Sonnet) cho toàn bộ pipeline là lãng phí tài nguyên, tốn kém API cost và tăng độ trễ không cần thiết cho các tác vụ đơn giản. Explorer chỉ cần đọc DOM và thực thi tool call có sẵn — không cần model đắt tiền. Reporter chỉ format markdown từ JSON có cấu trúc — Ollama local là đủ.

**Giải pháp — Right Model for the Right Task:** Cấu trúc lại block `llm` trong config để cho phép định tuyến model khác nhau cho từng Agent.

**Thay đổi Config — từ object đơn sang object phân tầng:**

```jsonc
// TRƯỚC v3.2 — một model dùng cho tất cả
{
  "llm": {
    "provider": "openai",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o",
    "apiKey": "$OPENAI_API_KEY"
  }
}

// SAU v3.2 — mỗi Agent có model riêng
{
  "llm": {
    "default": {
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-4o-mini",
      "apiKey": "$OPENAI_API_KEY"
    },
    "analyzer": {
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
    "reporter": {
      "provider": "ollama",
      "baseUrl": "http://localhost:11434/v1",
      "model": "qwen2.5:7b",
      "apiKey": ""
    }
  }
}
```

**Fallback rule:** Nếu Agent nào không có config riêng, fallback về `llm.default`. Nếu không có `llm.default`, fallback về Ollama qwen2.5:7b (giữ nguyên behavior cũ cho backward compatibility).

**LLM Client — per-agent model resolution:**

```typescript
// agent/llm-client.ts
type AgentName = 'analyzer' | 'explorer' | 'reporter';

interface LLMConfig {
  provider: string;
  baseUrl:  string;
  model:    string;
  apiKey:   string;
}

function resolveAgentLLM(agentName: AgentName, config: Config): LLMConfig {
  // Thứ tự ưu tiên: agent-specific → default → built-in fallback
  const agentConfig = config.llm[agentName];
  const defaultConfig = config.llm.default;
  const builtinFallback: LLMConfig = {
    provider: 'ollama',
    baseUrl:  'http://localhost:11434/v1',
    model:    'qwen2.5:7b',
    apiKey:   ''
  };

  return agentConfig ?? defaultConfig ?? builtinFallback;
}

// Khởi tạo OpenAI client riêng cho từng Agent
function createAgentClient(agentName: AgentName, config: Config): OpenAI {
  const llmConfig = resolveAgentLLM(agentName, config);

  return new OpenAI({
    apiKey:  llmConfig.apiKey || 'ollama',  // ollama không cần key thực
    baseURL: llmConfig.baseUrl,
  });
}

// Dùng trong node:
// analyzerNode  → createAgentClient('analyzer', config)
// explorerNode  → createAgentClient('explorer', config)
// reporterNode  → createAgentClient('reporter', config)
```

**Ví dụ cấu hình thực tế — tối ưu cost/performance:**

```jsonc
// Cấu hình hybrid: Cloud brain + Local hands/reporter
{
  "llm": {
    "default": {
      "provider": "ollama",
      "baseUrl": "http://localhost:11434/v1",
      "model": "qwen2.5:7b",
      "apiKey": ""
    },
    "analyzer": {
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com/v1",
      "model": "claude-sonnet-4-5",
      "apiKey": "$ANTHROPIC_API_KEY"
    },
    "explorer": {
      "provider": "google",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
      "model": "gemini-2.0-flash",
      "apiKey": "$GOOGLE_API_KEY"
    }
    // reporter không khai báo → fallback về default (ollama qwen2.5:7b)
  }
}
```

**Vai trò và yêu cầu model theo từng Agent:**

| Agent | Vai trò | Yêu cầu model | Gợi ý Tier |
|---|---|---|---|
| Analyzer | Suy luận bug, đọc stack trace, viết BrowserTask chi tiết | Reasoning mạnh, context lớn | Tier 1 |
| Explorer | Đọc DOM, thực thi tool call từ Task có sẵn, không tự quyết định | Phản hồi nhanh, tool calling | Tier 2 |
| Reporter | Format JSON thành Markdown có cấu trúc | Instruction following cơ bản | Tier 3 |

---

### 6.8 Model Auto-Profiler — Dynamic Auto-Tuning *(MỚI v3.2)*

**Vấn đề:** Các model nhỏ (local/Tier 3) có context window hạn chế, dễ bị "ngợp" nếu nhồi DOM quá to hoặc BrowserTask history quá dài, dẫn đến hallucination hoặc quên instruction. Bắt user tự tìm hiểu và cấu hình thủ công `compressThreshold` hay `tokenBudgetRatio` cho từng model là UX tồi — đặc biệt với người mới.

**Giải pháp:** Module `model-profiler.ts` chạy ngay sau khi load config, trước khi khởi tạo bất kỳ Agent nào. Module phân loại từng model trong config thành 3 Tier và **override** các thông số hệ thống tương ứng để bảo vệ model.

**Model Tier Classification:**

```typescript
// model/profiler.ts
export type ModelTier = 'tier1' | 'tier2' | 'tier3';

// Danh sách pattern nhận diện model theo Tier
// Có thể mở rộng khi có model mới
const TIER_PATTERNS: Record<ModelTier, RegExp[]> = {
  tier1: [
    /gpt-4o(?!-mini)/i,
    /claude-3[-.]5/i,
    /claude-opus/i,
    /gemini-1\.5-pro/i,
    /deepseek-r1/i,
  ],
  tier2: [
    /gpt-4o-mini/i,
    /gemini-2\.0-flash/i,
    /gemini-1\.5-flash/i,
    /claude-haiku/i,
    /deepseek-chat/i,
    /llama-3.*70b/i,
    /qwen.*72b/i,
  ],
  tier3: [
    /qwen.*7b/i,
    /llama-3.*8b/i,
    /phi-3/i,
    /mistral-7b/i,
    /ollama/i,          // generic ollama fallback
  ]
};

export function classifyModel(modelName: string): ModelTier {
  for (const [tier, patterns] of Object.entries(TIER_PATTERNS)) {
    if (patterns.some(p => p.test(modelName))) {
      return tier as ModelTier;
    }
  }
  // Unknown model → conservative fallback về Tier 2
  return 'tier2';
}
```

**Profile thông số theo Tier:**

```typescript
// model/profiler.ts
export interface ModelProfile {
  tier:              ModelTier;
  domElementLimit:   number;   // Số element tối đa trong browser_get_dom output
  compressThreshold: number;   // Compress BrowserTaskHistory sau N task thành công
  tokenBudgetRatio:  number;   // % context window được phép dùng
  taskTimeoutMs:     number;   // Timeout cho mỗi BrowserTask (model local chậm hơn)
}

export const TIER_PROFILES: Record<ModelTier, ModelProfile> = {
  tier1: {
    tier:              'tier1',
    domElementLimit:   150,
    compressThreshold: 10,
    tokenBudgetRatio:  0.85,
    taskTimeoutMs:     45_000,
  },
  tier2: {
    tier:              'tier2',
    domElementLimit:   80,
    compressThreshold: 5,
    tokenBudgetRatio:  0.75,
    taskTimeoutMs:     60_000,
  },
  tier3: {
    tier:              'tier3',
    domElementLimit:   40,
    compressThreshold: 3,
    tokenBudgetRatio:  0.60,
    taskTimeoutMs:     120_000,  // Local model chậm hơn → nới timeout
  },
};
```

**Profiler entry point — chạy sau khi load config:**

```typescript
// model/profiler.ts
export interface AgentProfiles {
  analyzer: ModelProfile;
  explorer: ModelProfile;
  reporter: ModelProfile;
}

export function profileAgents(config: Config): AgentProfiles {
  const analyzerModel  = resolveAgentLLM('analyzer', config).model;
  const explorerModel  = resolveAgentLLM('explorer', config).model;
  const reporterModel  = resolveAgentLLM('reporter', config).model;

  const profiles: AgentProfiles = {
    analyzer: TIER_PROFILES[classifyModel(analyzerModel)],
    explorer: TIER_PROFILES[classifyModel(explorerModel)],
    reporter: TIER_PROFILES[classifyModel(reporterModel)],
  };

  // Log để user biết Profiler đã áp dụng gì
  eventBus.emit({
    type: 'profiler_result',
    analyzer: { model: analyzerModel, tier: profiles.analyzer.tier },
    explorer: { model: explorerModel, tier: profiles.explorer.tier },
    reporter: { model: reporterModel, tier: profiles.reporter.tier },
  });

  return profiles;
}
```

**Override thông số hệ thống — Profiler thắng, config thua:**

Các thông số trong `ai-debug.config.json` như `agent.compressThreshold`, `agent.tokenBudgetRatio`, `agent.taskTimeoutMs` chỉ là **manual override**. Nếu Profiler phát hiện model nhỏ hơn những gì config khai báo, Profiler **thắng**:

```typescript
// index.ts — sau khi load config và chạy Profiler
const agentProfiles = profileAgents(config);

// Thông số thực tế áp dụng cho Analyzer:
const analyzerSettings = {
  compressThreshold: Math.min(
    config.agent.compressThreshold ?? Infinity,  // user manual setting
    agentProfiles.analyzer.compressThreshold     // profiler protection
  ),
  tokenBudgetRatio: Math.min(
    config.agent.tokenBudgetRatio ?? 1,
    agentProfiles.analyzer.tokenBudgetRatio
  ),
  taskTimeoutMs: Math.max(
    config.agent.taskTimeoutMs ?? 0,
    agentProfiles.explorer.taskTimeoutMs         // Explorer timeout dùng Explorer profile
  ),
};

// dom element limit dùng Explorer profile (vì Explorer là agent gọi get_dom)
const domElementLimit = agentProfiles.explorer.domElementLimit;
```

**Lý do Profiler thắng:** Giá trị config thủ công thường được đặt cho model mạnh. Nếu user sau đó đổi sang model nhỏ hơn mà quên điều chỉnh config, Profiler sẽ tự động hạ thông số xuống mức an toàn — thay vì để model bị crash hoặc hallucinate.

**Bảng tóm tắt thông số theo Tier:**

| Thông số | Tier 1 (Cloud Heavyweights) | Tier 2 (Mid/Fast) | Tier 3 (Local Lightweights) |
|---|---|---|---|
| DOM Element Limit | 150 | 80 | 40 |
| Compress Threshold | 10 tasks | 5 tasks | 3 tasks |
| Token Budget Ratio | 85% | 75% | 60% |
| Task Timeout | 45s | 60s | 120s |
| SPA Click Wait | 300ms | 400ms | 600ms |
| SPA Fill Wait | 100ms | 150ms | 250ms |
| Ví dụ model | gpt-4o, claude-3.5-sonnet | gemini-2.0-flash, gpt-4o-mini | qwen2.5:7b, llama-3-8b |

---

## 7. CLI Interface

```bash
# Cài đặt
npm install -g ai-debug-agent

# Chạy debug
ai-debug run --url "/settings" --task "upload avatar bị lỗi"
ai-debug run -u "/settings" -t "upload avatar bị lỗi"

# Hiện browser
ai-debug run -u "/checkout" -t "thanh toán không hoàn thành" --visible

# Tăng timeout
ai-debug run -u "/dashboard" -t "dữ liệu không hiển thị" --timeout 60000
```

### Terminal output mẫu *(cập nhật v3.2 — Multi-Model)*

```
🤖 AI Debug Agent v3.2.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task     : upload avatar bị lỗi
🌐 URL      : http://localhost:3000/settings
🧠 Models   : Analyzer (openai/gpt-4o) | Explorer (google/gemini-2.0-flash) | Reporter (ollama/qwen2.5:7b)
⚙️  Profile  : Tier 1 (Brain) / Tier 2 (Hands) / Tier 3 (Writer) — Auto-tuned
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[00:01] ⚙️  Khởi động MCP Server...
[00:02] ✅ MCP Server sẵn sàng (12 tools)
[00:02] 🔍 [Profiler] Analyzer → gpt-4o (Tier 1): domLimit=150, compress=10, budget=85%
[00:02] 🔍 [Profiler] Explorer → gemini-2.0-flash (Tier 2): domLimit=80, timeout=60s
[00:02] 🔍 [Profiler] Reporter → qwen2.5:7b (Tier 3): budget=60%
[00:03] 🔐 [Auth] Đang đăng nhập...
[00:04] ✅ [Auth] Đăng nhập thành công [session: abc123]
[00:05] 🧠 [Analyzer/gpt-4o] Phân tích task → xác định: File Upload bug pattern
[00:06] 🧠 [Analyzer/gpt-4o] Viết BrowserTask: "Testing Avatar Upload Flow"
[00:07] 🎬 [Explorer] Bắt đầu recording: avatar_upload_test
[00:07] 🤖 [Explorer/gemini-2.0-flash] Upload ảnh avatar 2MB để kiểm tra giới hạn file size
[00:08] 🤖 [Explorer] → browser_navigate /settings ✓
[00:09] 🤖 [Explorer] → browser_get_dom (22 elements, 1 iFrame) ✓
[00:10] 🤖 [Explorer] → browser_upload_file input[name='avatar'] 2MB ✓
[00:11] 🤖 [Explorer] → browser_screenshot (error visible) ✓
[00:11] 📦 [Explorer] Hoàn thành. Return: status=413, UI="File too large"
[00:12] 🧠 [Analyzer/gpt-4o] browser_get_logs...
[00:12] ❌ [Network] POST /api/user/avatar → 413 Payload Too Large
[00:12] 🔴 [Console] Error: Request failed with status 413
[00:13] 🧠 [Analyzer/gpt-4o] Evidence đủ. Gọi finish_analysis...
[00:14] 📝 [Reporter/qwen2.5:7b] Tổng hợp báo cáo + đính kèm recording...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Hoàn thành! Báo cáo đã được lưu:
   📄 ./debug-reports/settings-2024-01-15T10-30-00.md
   🎬 ./debug-reports/recordings/avatar_upload_test-2024-01-15T10-30-00.webp
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 8. Browser Tools — MCP Tool Definitions

| Tool | Agent có quyền | Mô tả |
|---|---|---|
| `browser_navigate` | Explorer | Điều hướng đến URL |
| `browser_get_dom` | Explorer | Lấy interactive elements (+ iFrame support, giới hạn bởi Profiler) |
| `browser_click` | Explorer | Click element (qua guardrails) |
| `browser_fill` | Explorer | Điền text vào input |
| `browser_select` | Explorer | Chọn option trong dropdown |
| `browser_upload_file` | Explorer | Upload file test (tự tạo file giả) |
| `browser_scroll` | Explorer | Scroll trang hoặc đến element |
| `browser_hover` | Explorer | Hover vào element |
| `browser_wait` | Explorer | Chờ element / network idle / duration |
| `browser_screenshot` | Explorer | Chụp màn hình, lưu vào report |
| `browser_get_logs` | **Analyzer** | Lấy console logs + network requests đã buffer |
| `finish_analysis` | **Analyzer** | Kết thúc Agent Loop, kích hoạt Reporter |

### `browser_get_dom` — Output mẫu (v2, có frameId)

```typescript
{
  url: "http://localhost:3000/settings",
  title: "Cài đặt tài khoản",
  interactiveElements: [
    {
      type: "input",
      inputType: "file",
      ariaLabel: "upload-avatar",
      selector: "input[name='avatar']",
      stabilityScore: 80,
      isVisible: true,
      isDisabled: false,
      frameId: null
    },
    {
      type: "input",
      inputType: "text",
      placeholder: "Card number",
      selector: "input[name='cardnumber']",
      stabilityScore: 80,
      isVisible: true,
      isDisabled: false,
      frameId: "https://js.stripe.com/v3/..."
    }
  ],
  pageText: "Cài đặt tài khoản\nẢnh đại diện\n...",
  iFrameCount: 1,
  elementLimitApplied: 80   // ← v3.2: cho biết domElementLimit của Explorer profile đang áp dụng
}
```

### `finish_analysis` — Input schema

```typescript
{
  summary:          string,
  rootCause:        string,
  bugCategory:      string,
  errorType?:       string,
  location?:        string,
  stepsToReproduce: string[],
  evidence: {
    consoleErrors:   string[],
    networkErrors:   string[],
    screenshotPath?: string
  },
  suggestedFix:     string,
  severity:         "critical" | "high" | "medium" | "low",
  cannotReproduce?: boolean
}
```

---

## 9. Config Reference

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
    "analyzer": {
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
    }
  },
  "auth": {
    "enabled": true,
    "strategy": "form",
    "loginUrl": "/login",
    "credentials": {
      "email": "dev@test.com",
      "password": "$TEST_USER_PASSWORD"
    },
    "successIndicator": "/dashboard",
    "timeoutMs": 30000
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
    "maxIterations": 20,
    "compressThreshold": 5,
    "taskTimeoutMs": 60000,
    "tokenBudgetRatio": 0.85,
    "maxRetries": 3,
    "retryBaseDelayMs": 1000
  },
  "guardrails": {
    "allowList": []
  },
  "output": {
    "reportsDir": "./debug-reports",
    "includeScreenshot": true,
    "deduplicationThreshold": 0.85
  }
}
```

**Ghi chú v3.2 — `agent.*` thông số và Profiler:**

Các thông số `agent.compressThreshold`, `agent.taskTimeoutMs`, `agent.tokenBudgetRatio` vẫn được đọc từ config, nhưng Model Auto-Profiler có thể **hạ xuống** nếu model được cấu hình thuộc Tier thấp hơn. Profiler không bao giờ tăng thông số lên — chỉ bảo vệ, không vượt giới hạn an toàn.

**Secret management:**

`ai-debug.config.json` hỗ trợ cú pháp `"$ENV_VAR_NAME"` để tránh hardcode credentials. `config-loader.ts` tự động resolve các giá trị bắt đầu bằng `$` thành env variable:

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

**Provider examples:**

```jsonc
// OpenAI — single provider (backward compatible)
{ "llm": { "default": { "provider": "openai", "baseUrl": "https://api.openai.com/v1", "model": "gpt-4o", "apiKey": "$OPENAI_API_KEY" } } }

// Anthropic analyzer + Gemini explorer + Ollama reporter
{
  "llm": {
    "analyzer": { "provider": "anthropic", "baseUrl": "https://api.anthropic.com/v1", "model": "claude-sonnet-4-5", "apiKey": "$ANTHROPIC_API_KEY" },
    "explorer": { "provider": "google", "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai", "model": "gemini-2.0-flash", "apiKey": "$GOOGLE_API_KEY" },
    "default":  { "provider": "ollama", "baseUrl": "http://localhost:11434/v1", "model": "qwen2.5:7b", "apiKey": "" }
  }
}

// Deepseek cho tất cả — single provider, multi-agent sẽ dùng chung default
{ "llm": { "default": { "provider": "deepseek", "baseUrl": "https://api.deepseek.com/v1", "model": "deepseek-chat", "apiKey": "$DEEPSEEK_API_KEY" } } }

// Ollama local toàn bộ (default)
{ "llm": { "default": { "provider": "ollama", "baseUrl": "http://localhost:11434/v1", "model": "qwen2.5:7b", "apiKey": "" } } }

// Cookie-based auth
{ "auth": { "enabled": true, "strategy": "cookie", "cookies": [{ "name": "session", "value": "$SESSION_TOKEN", "domain": "localhost" }] } }
```

**Config field reference:**

| Field | Mô tả | Default |
|---|---|---|
| `llm.default.provider` | Provider fallback | `ollama` |
| `llm.default.baseUrl` | OpenAI-compatible endpoint fallback | `http://localhost:11434/v1` |
| `llm.default.model` | Model fallback | `qwen2.5:7b` |
| `llm.analyzer.*` | Config riêng cho Analyzer | fallback về `default` |
| `llm.explorer.*` | Config riêng cho Explorer | fallback về `default` |
| `llm.reporter.*` | Config riêng cho Reporter | fallback về `default` |
| `auth.strategy` | `"form"` hoặc `"cookie"` | `"form"` |
| `auth.timeoutMs` | Timeout cho toàn bộ login flow | `30000` |
| `browser.spaWaitMs` | Wait sau click để DOM ổn định (override Profiler) | Profiler Tier |
| `browser.spaFillWaitMs` | Wait sau fill (override Profiler) | Profiler Tier |
| `agent.maxIterations` | Số lần Analyzer dispatch tối đa | `20` |
| `agent.taskTimeoutMs` | Timeout cho mỗi BrowserTask (Profiler có thể override) | `60000` |
| `agent.tokenBudgetRatio` | Tỉ lệ context window được dùng (Profiler có thể hạ) | `0.85` |
| `agent.compressThreshold` | Compress sau N BrowserTask thành công (Profiler có thể hạ) | `5` |
| `agent.maxRetries` | Số lần retry khi LLM API lỗi | `3` |
| `agent.retryBaseDelayMs` | Base delay cho exponential backoff | `1000` |
| `guardrails.allowList` | Selector override guardrails | `[]` |
| `output.deduplicationThreshold` | Ngưỡng Jaccard similarity để coi là duplicate | `0.85` |

---

## 10. Bug Pattern Catalogue

### 10.1 Form Submission
*Đăng ký, checkout, đặt hàng, đổi mật khẩu...*

**Approach:** Tìm inputs → điền dữ liệu test hợp lệ → submit → đọc network + console

**Lỗi thường gặp:** API 4xx/5xx không có error handling, double submit, redirect sai

### 10.2 Data Display
*Dashboard, danh sách, profile, lịch sử...*

**Approach:** Navigate → đọc console ngay lập tức → kiểm tra network requests

**Lỗi thường gặp:** API trả `null` không có null-check, race condition

### 10.3 User Interaction
*Tìm kiếm, lọc, phân trang, tab switching...*

**Approach:** Tìm controls → thao tác → quan sát API call params → kiểm tra re-render

**Lỗi thường gặp:** Debounce broken, filter gửi params sai, tab switch giữ state cũ

### 10.4 File & Media
*Upload ảnh, import CSV, download báo cáo...*

**Approach (upload):** Tìm `input[type=file]` → upload nhiều size/type → đọc network response

**Approach (download):** Click nút download → kiểm tra response headers + status

**Lỗi thường gặp:** 413 không có UI feedback, CORS khi upload CDN, download URL expired

### 10.5 Navigation & Auth
*Protected routes, redirect sau login, deep link...*

**Approach:** Navigate thẳng URL → quan sát redirect chain → kiểm tra auth errors

**Lỗi thường gặp:** Protected route redirect sai, redirect loop, token hết hạn

### 10.6 State Management
*Multi-step form, giỏ hàng, draft lưu tạm...*

**Approach:** Chuỗi actions → quan sát DOM sau mỗi bước → thử edge cases (back, refresh, double click)

**Lỗi thường gặp:** State không persist sau refresh, duplicate entries, multi-step mất data khi back

### 10.7 API Response Handling
*Cross-cutting — xảy ra ở bất kỳ chức năng nào*

Nhận diện: API 2xx nhưng trang vẫn lỗi, API lỗi nhưng không có UI feedback, API không được gọi dù user đã action.

---

## 11. Xử lý các vấn đề kỹ thuật

### 11.1 Malformed tool calls
**Giải pháp:** `tool-parser.ts` fallback: parse JSON thẳng → extract JSON bằng regex → trả object rỗng + log warning. Đảm bảo Agent Loop không crash khi provider trả về format không chuẩn.

### 11.2 Network logs phải capture trước khi request xảy ra
**Giải pháp:** `collector.ts` bật listener ngay khi browser khởi tạo, buffer tất cả requests/responses suốt session.

### 11.3 Race condition sau click (SPA)
**Giải pháp:** `actions.ts` → `clickAndWait()` đợi `networkidle` + 300ms + `domcontentloaded` trước khi return.

### 11.4 DOM quá lớn vượt context window
**Giải pháp:** `browser_get_dom` giới hạn số element theo **Explorer model Tier** (Tier 1: 150, Tier 2: 80, Tier 3: 40) — được Model Auto-Profiler set tự động. Memory Compression giữ BrowserTaskHistory nhỏ gọn theo Tier của Analyzer. *(cập nhật v3.2)*

### 11.5 Selector không ổn định sau re-render
**Giải pháp:** `actions.ts` fallback: CSS selector → `getByText()` → error rõ ràng để Explorer gọi `get_dom` lại.

### 11.6 Vòng lặp vô tận
**Giải pháp:** Hard limit `maxIterations`. Orchestrator force inject vào Analyzer khi đạt giới hạn.

### 11.7 State Bloat
**Giải pháp:** Compression logic trong `analyzerNode` gom N BrowserTask thành công thành 1 dòng tóm tắt. Ngưỡng N được Model Auto-Profiler điều chỉnh theo Tier của Analyzer model. *(cập nhật v3.2)*

### 11.8 Bug trong iFrame / Shadow DOM
**Giải pháp:** `dom.ts` đệ quy qua `page.frames()`. Element trong iFrame được đánh dấu `frameId` để Explorer switch frame đúng khi click.

### 11.9 Click vào element nguy hiểm
**Giải pháp:** `safeClick()` trong `actions.ts` kiểm tra text + aria-label trước khi thực thi. Chặn cứng ở tầng code.

### 11.10 Context window overflow — token budget
**Giải pháp:** `llm-client.ts` kiểm tra token budget trước mỗi call. Ngưỡng `tokenBudgetRatio` được Model Auto-Profiler set per-agent dựa trên Tier (Tier 1: 85%, Tier 2: 75%, Tier 3: 60%). Nếu vượt ngưỡng, tự động trim theo thứ tự: cắt `consoleErrors` cũ → cắt `networkErrors` cũ → cắt `compressedSummary` xuống còn 3 dòng gần nhất. *(cập nhật v3.2)*

```typescript
// llm-client.ts — v3.2: dùng profile của từng Agent thay vì TOKEN_BUDGET cứng
function trimToTokenBudget(
  messages: Message[],
  agentProfile: ModelProfile
): Message[] {
  const contextWindow = getContextWindowSize(agentProfile);
  const budget = Math.floor(contextWindow * agentProfile.tokenBudgetRatio);
  const estimated = estimateTokens(messages);

  if (estimated <= budget) return messages;

  eventBus.emit({
    type: 'warning',
    message: `Token budget exceeded (${estimated} > ${budget}, ratio=${agentProfile.tokenBudgetRatio}), trimming evidence...`
  });

  return trimEvidenceFromMessages(messages, budget);
}
```

### 11.11 BrowserTask không có timeout riêng
**Giải pháp:** Wrap toàn bộ Explorer execution trong `Promise.race` với hard timeout. Giá trị timeout lấy từ **Explorer model profile** (Tier 1: 45s, Tier 2: 60s, Tier 3: 120s) — local model cần timeout lớn hơn vì chạy chậm hơn. *(cập nhật v3.2)*

```typescript
// explorer-agent.ts
async function runBrowserTask(task: BrowserTask): Promise<BrowserTaskResult> {
  const timeoutMs = agentProfiles.explorer.taskTimeoutMs;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('BrowserTask timeout exceeded')), timeoutMs)
  );

  try {
    return await Promise.race([executeTask(task), timeout]);
  } catch (err) {
    if (err.message.includes('timeout')) {
      return {
        subagentId: currentSessionId,
        success: false,
        report: `Task timed out after ${timeoutMs}ms. Partial results: ${getPartialResults()}`,
        recordingPath: await saveCurrentRecording(),
        screenshotPath: await takeEmergencyScreenshot()
      };
    }
    throw err;
  }
}
```

### 11.12 FinishAnalysisPayload không được validate
**Giải pháp:** Validate bằng Zod ngay khi nhận từ LLM, trước khi pass sang Reporter. Nếu fail validation → inject lại vào Analyzer với error message cụ thể, tối đa 2 lần.

```typescript
// shared/types.ts
const FinishAnalysisSchema = z.object({
  summary:          z.string().min(10),
  rootCause:        z.string().min(10),
  bugCategory:      z.enum(['form_submission', 'data_display', 'user_interaction',
                             'file_media', 'navigation_auth', 'state_management', 'api_response']),
  errorType:        z.string().optional(),
  location:         z.string().optional(),
  stepsToReproduce: z.array(z.string()).min(1),
  evidence: z.object({
    consoleErrors:  z.array(z.string()),
    networkErrors:  z.array(z.string()),
    screenshotPath: z.string().optional()
  }),
  suggestedFix:     z.string().min(10),
  severity:         z.enum(['critical', 'high', 'medium', 'low']),
  cannotReproduce:  z.boolean().optional()
});
```

### 11.13 LLM API failures không có retry
**Giải pháp:** `llm-client.ts` wrap mọi API call với exponential backoff + jitter. `maxRetries` và `retryBaseDelayMs` đọc từ config — không hardcode.

```typescript
// agent/llm-client.ts
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function callWithRetry<T>(
  fn:      () => Promise<T>,
  config:  Config,
  attempt: number = 0
): Promise<T> {
  const maxRetries      = config.agent.maxRetries      ?? 3;     // default 3, user-overridable
  const baseDelayMs     = config.agent.retryBaseDelayMs ?? 1000; // default 1s, user-overridable

  try {
    return await fn();
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    const isRetryable = RETRYABLE_STATUS.has(status) || err.code === 'ECONNRESET';

    if (!isRetryable || attempt >= maxRetries) throw err;

    const delay = baseDelayMs * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4);
    const retryAfter = err?.headers?.['retry-after'];
    const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : delay;

    eventBus.emit({
      type: 'warning',
      message: `LLM API error (${status}), retrying in ${Math.round(waitMs/1000)}s... (${attempt + 1}/${maxRetries})`
    });

    await sleep(waitMs);
    return callWithRetry(fn, config, attempt + 1);
  }
}
```

**Config:**
```json
{
  "agent": {
    "maxRetries":       3,
    "retryBaseDelayMs": 1000
  }
}
```

### 11.14 Graceful shutdown khi Ctrl+C
**Giải pháp:** Register signal handler ngay khi khởi động. Cleanup theo thứ tự đảm bảo không mất data.

```typescript
// index.ts
async function gracefulShutdown(signal: string) {
  console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);
  graphController.abort();
  await recorder.finalize();
  await debugLogger.flush();
  await browserContext?.close();
  await browser?.close();
  tuiApp?.unmount();
  process.exit(0);
}

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', async (err) => {
  eventBus.emit({ type: 'error', agent: 'system', message: err.message });
  await gracefulShutdown('uncaughtException');
});
```

### 11.15 Model không nhận diện được bởi Profiler *(MỚI v3.2)*
**Vấn đề:** User dùng model mới chưa có trong `TIER_PATTERNS` — Profiler không biết nên xếp vào Tier nào.

**Giải pháp:** Fallback về Tier 2 (thông số trung bình, an toàn). Log warning để user biết. Cho phép override thủ công qua config:

```json
{
  "llm": {
    "analyzer": {
      "provider": "custom",
      "model": "my-custom-model-v2",
      "tier": "tier1"   // ← override Profiler, force Tier 1
    }
  }
}
```

```typescript
// model/profiler.ts
export function classifyModel(modelName: string, tierOverride?: ModelTier): ModelTier {
  if (tierOverride) return tierOverride;  // manual override thắng

  for (const [tier, patterns] of Object.entries(TIER_PATTERNS)) {
    if (patterns.some(p => p.test(modelName))) return tier as ModelTier;
  }

  eventBus.emit({
    type: 'warning',
    message: `Unknown model "${modelName}" — defaulting to Tier 2. Add "tier": "tier1|tier2|tier3" to config to override.`
  });
  return 'tier2';
}
```

---

## 12. Auth Flow

### 12.1 Flow tổng quát

```
Orchestrator khởi động
      │
      ▼
auth.enabled = true?
      │
   YES│                         NO│
      ▼                           ▼
  navigate(loginUrl)         Bỏ qua auth
      │                           │
      ▼                           │
  [AUTH TIMEOUT GUARD]           │
  max: auth.timeoutMs (30s)      │
      │                           │
      ▼                           │
  get_dom → nhận diện            │
  loại auth form                 │
      │                           │
      ├── standard form           │
      ├── SSO / OAuth redirect    │
      └── không nhận ra           │
           → dừng, báo lỗi       │
      │                           │
      ▼                           │
  fill + submit                  │
      │                           │
      ▼                           │
  wait(successIndicator)         │
      │                           │
  Thành công trong timeout?      │
  YES → lưu sessionId ◄──────────┘
  NO  → dừng, báo lỗi rõ ràng
```

### 12.2 Giới hạn và fallback

| Auth type | Hành vi |
|---|---|
| Standard email/password form | ✅ Hỗ trợ đầy đủ |
| SSO / OAuth redirect | ⚠️ Timeout sau `auth.timeoutMs`, báo lỗi cụ thể |
| Magic link / Email OTP | ⚠️ Timeout, gợi ý dùng `auth.strategy: "cookie"` thay thế |
| CAPTCHA | ⚠️ Timeout, gợi ý bypass qua cookie injection |
| 2FA / TOTP | ⚠️ Timeout, báo lỗi |

**Fallback cho app dùng SSO/OAuth:**
```json
{
  "auth": {
    "enabled": true,
    "strategy": "cookie",
    "cookies": [
      { "name": "session_token", "value": "$SESSION_TOKEN", "domain": "localhost" },
      { "name": "auth_token",    "value": "$AUTH_TOKEN",    "domain": "localhost" }
    ]
  }
}
```

### 12.3 Auth timeout guard

```typescript
// auth/login.ts
async function performLogin(): Promise<{ success: boolean; error?: string }> {
  const AUTH_TIMEOUT = config.auth.timeoutMs ?? 30_000;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Auth timeout')), AUTH_TIMEOUT)
  );

  try {
    return await Promise.race([attemptLogin(), timeout]);
  } catch (err) {
    if (err.message === 'Auth timeout') {
      return {
        success: false,
        error: `Login did not complete within ${AUTH_TIMEOUT}ms. ` +
               `If your app uses SSO/OAuth/magic link, use auth.strategy="cookie" instead.`
      };
    }
    return { success: false, error: err.message };
  }
}
```

---

## 13. Observability Layer

Ba tầng monitor độc lập, kết nối qua một `EventBus` trung tâm.

### 13.1 EventBus — Trung tâm kết nối

```typescript
// observability/event-bus.ts
type AgentEvent =
  | { type: 'reasoning';      agent: AgentName; text: string }
  | { type: 'tool_call';      agent: AgentName; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result';    agent: AgentName; tool: string; success: boolean; durationMs: number }
  | { type: 'evidence';       kind: 'network' | 'console'; data: string }
  | { type: 'task_start';     taskName: string; taskSummary: string }
  | { type: 'task_end';       taskName: string; success: boolean }
  | { type: 'llm_usage';      agent: AgentName; promptTokens: number; completionTokens: number }
  | { type: 'profiler_result'; analyzer: AgentTierInfo; explorer: AgentTierInfo; reporter: AgentTierInfo }  // MỚI v3.2
  | { type: 'error';          agent: AgentName; message: string };

// v3.2 helper type
interface AgentTierInfo { model: string; tier: ModelTier; }
```

---

### 13.2 Live TUI Dashboard — `ink` *(cập nhật v3.2)*

Layout cập nhật để hiển thị Multi-Model config và thông số Auto-Profiler:

```
┌─ AI Debug Agent v3.2 ─────────────────────────────────────┐
│ Task: upload avatar bị lỗi          [02:14]  iter 2 / 20  │
│ 🧠 Models: Analyzer (gpt-4o) | Explorer (gemini-2.0-flash) │
│ ⚙️  Profile: Tier 1 (Brain) / Tier 2 (Hands) — Auto-tuned  │
├─ Agent Activity ───────────────────────────────────────────┤
│                                                            │
│  🧠 ANALYZER  [gpt-4o · Tier 1]                            │
│  ┆ "DOM có input[type=file] ở section avatar.             │
│  ┆  Upload 1MB trước để baseline, sau đó tăng lên 5MB     │
│  ┆  để tìm giới hạn thực sự của server."                  │
│                                                            │
│  🤖 EXPLORER  [gemini-2.0-flash · Tier 2]                  │
│  ›  browser_upload_file                                    │
│     selector : input[name='avatar']                        │
│     size     : 2MB  •  type: image/jpeg                    │
│     ✓ 987ms — status 413 received                          │
│                                                            │
├─ Evidence Collected ───────────────────────────────────────┤
│  ❌  Network   POST /api/user/avatar    413                 │
│  🔴  Console   Error: Payload Too Large                    │
├─ Recording ────────────────────────────────────────────────┤
│  🎬  avatar_upload_test.webp    [● REC  02:09]             │
└────────────────────────────────────────────────────────────┘
```

**Flags CLI:**
```bash
# Default: TUI đầy đủ
ai-debug run -u "/settings" -t "upload avatar lỗi"

# Tắt TUI, dùng plain text (CI/CD, pipe output)
ai-debug run -u "/settings" -t "upload avatar lỗi" --no-tui

# Hiện thêm raw tool args và token counts
ai-debug run -u "/settings" -t "upload avatar lỗi" --verbose
```

---

### 13.3 Chain of Thought Streaming

Reasoning text từ LLM được stream realtime — hiển thị trong TUI trước khi tool call xảy ra.

```typescript
// llm-client.ts
async function* streamCompletion(
  agent: AgentName,
  messages: Message[],
  tools: Tool[]
): AsyncGenerator<AgentEvent> {
  const stream = await openai.chat.completions.stream({
    model: config.llm.model,
    messages,
    tools,
    stream: true
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0].delta;

    if (delta.content) {
      yield { type: 'reasoning', agent, text: delta.content };
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        yield { type: 'tool_call', agent, tool: tc.function.name, args: JSON.parse(tc.function.arguments) };
      }
    }
  }

  const usage = await stream.finalUsage();
  yield { type: 'llm_usage', agent, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens };
}
```

---

### 13.4 Debug Log — JSONL *(cập nhật v3.2)*

JSONL log mở rộng với event `profiler_result` và field `agentModel` trên mỗi `llm_request`:

```jsonl
{"ts":"10:30:00.000","type":"session_start","task":"upload avatar lỗi","models":{"analyzer":"gpt-4o","explorer":"gemini-2.0-flash","reporter":"qwen2.5:7b"}}
{"ts":"10:30:00.100","type":"profiler_result","analyzer":{"model":"gpt-4o","tier":"tier1","domLimit":150,"compress":10},"explorer":{"model":"gemini-2.0-flash","tier":"tier2","domLimit":80,"timeout":60000},"reporter":{"model":"qwen2.5:7b","tier":"tier3","budget":0.6}}
{"ts":"10:30:01.123","type":"llm_request","agent":"analyzer","agentModel":"gpt-4o","promptTokens":842}
{"ts":"10:30:02.891","type":"reasoning","agent":"analyzer","text":"DOM có input[type=file] ở section avatar..."}
{"ts":"10:30:03.200","type":"tool_call","agent":"explorer","agentModel":"gemini-2.0-flash","tool":"browser_upload_file","args":{"selector":"input[name='avatar']","fileType":"image","fileSizeMb":2}}
{"ts":"10:30:04.843","type":"tool_result","agent":"explorer","tool":"browser_upload_file","success":true,"durationMs":987}
{"ts":"10:30:04.900","type":"evidence","kind":"network","data":"POST /api/user/avatar → 413 Payload Too Large"}
{"ts":"10:30:05.500","type":"session_end","status":"evidence_collected","totalIterations":2,"totalTokens":2291}
```

---

## 14. Bug Report Output

File lưu tại `{reportsDir}/{page-slug}-{timestamp}.md`.

```markdown
# 🐛 Bug Report — {tên chức năng}

**Thời gian:** {timestamp}
**URL:** {url}
**Task:** {mô tả từ người dùng}
**Models:** Analyzer ({provider}/{model}) | Explorer ({provider}/{model}) | Reporter ({provider}/{model})
**Profile:** Tier {X} (Brain) / Tier {Y} (Hands) / Tier {Z} (Writer)
**Phân loại:** {bugCategory}
**Severity:** {critical|high|medium|low}

---

## Tóm tắt
{Bug là gì, xảy ra khi nào, hậu quả}

---

## Các bước tái hiện
1. {bước 1}
2. {bước 2}
...

---

## Evidence

### Console Errors
{stack traces, exceptions}

### Network Errors
| Method | URL | Status | Notes |
|--------|-----|--------|-------|

### Recordings
| Task | File |
|------|------|
| {TaskName} | [{RecordingName}.webp]({path}) |

---

## Phân tích nguyên nhân
{Giải thích kỹ thuật}

---

## Đề xuất fix
{Code snippet hoặc hướng dẫn}

---

## Screenshot
{Nếu có}

---
*Generated by AI Debug Agent v3.2.0 — Multi-Agent (Explorer + Analyzer + Reporter)*
*Models: Analyzer ({model} Tier {X}) / Explorer ({model} Tier {Y}) / Reporter ({model} Tier {Z})*
*Explorer pattern: Antigravity one-shot BrowserTask dispatch*
```

---

## 15. Report Registry & Deduplication

### 15.1 Registry Schema

```typescript
// reporter/registry.ts
interface ReportEntry {
  id:           string;
  timestamp:    string;
  url:          string;
  task:         string;
  bugCategory:  string;
  severity:     string;
  rootCause:    string;
  reportPath:   string;
  recordingPath?: string;
  models?: {                  // v3.2: lưu thêm model info
    analyzer: string;
    explorer: string;
    reporter: string;
  };
}
```

### 15.2 Duplicate Detection

```typescript
function checkDuplicate(task: string, url: string, config: Config): ReportEntry | null {
  const registry  = loadRegistry();
  const threshold = config.output.deduplicationThreshold ?? 0.85; // default 0.85, user-overridable

  return registry.reports.find(r =>
    r.url === url && similarity(r.task, task) > threshold
  ) ?? null;
}
```

**Config:**
```json
{
  "output": {
    "deduplicationThreshold": 0.85
  }
}
```

Hạ threshold xuống (vd: `0.7`) nếu muốn bắt duplicate rộng hơn — cùng bug nhưng mô tả khác nhiều. Tăng lên (`0.95`) nếu muốn chỉ coi là duplicate khi task gần như giống hệt.

### 15.3 Registry CLI commands

```bash
ai-debug list
ai-debug list --severity critical
ai-debug list --url "/settings"
ai-debug open --latest
```

---

## 16. Dependencies

### mcp-server/package.json
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "playwright": "^1.44.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0"
  }
}
```

### mcp-client/package.json
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "openai": "^4.0.0",
    "@langchain/langgraph": "^0.2.0",
    "@langchain/core": "^0.3.0",
    "ink": "^4.4.1",
    "react": "^18.0.0",
    "commander": "^12.0.0",
    "dotenv": "^16.4.0",
    "better-sqlite3": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "@types/better-sqlite3": "^7.0.0",
    "tsx": "^4.7.0"
  }
}
```

| Package | Dùng ở | Lý do |
|---|---|---|
| `@modelcontextprotocol/sdk` | cả hai | MCP protocol |
| `playwright` | mcp-server | Headless browser + network interception |
| `zod` | mcp-server + shared | Validate tool inputs + FinishAnalysisPayload |
| `openai` | mcp-client | OpenAI-compatible client — mọi provider, mọi Agent *(v3.2: per-agent instance)* |
| `@langchain/langgraph` | mcp-client | StateGraph, checkpointing, MemorySaver/SqliteSaver |
| `@langchain/core` | mcp-client | LangGraph peer dependency |
| `better-sqlite3` | mcp-client | SqliteSaver backend cho production checkpointing |
| `ink` + `react` | mcp-client | Live TUI dashboard |
| `commander` | mcp-client | Parse CLI arguments |

---

## 17. Environment & Prerequisites

```bash
# Yêu cầu bắt buộc
node >= 24

# Nếu dùng Ollama (local, default)
ollama pull qwen2.5:7b   # hoặc bất kỳ model nào
ollama serve

# Nếu dùng provider cloud — chỉ cần API key trong .env
# OpenAI, Anthropic, Google, Deepseek... không cần cài thêm gì
```

---

## 18. Fixture App — Integration Testing

```
fixture-app/
├── server.ts
├── public/index.html
└── bugs/
    ├── upload-413.ts
    ├── form-500.ts
    ├── null-render.ts
    ├── double-submit.ts
    └── auth-redirect.ts
```

| Route | Bug type | Expected detection |
|---|---|---|
| `POST /api/upload` | 413 khi file > 1MB, không có UI feedback | Network 413 + console error |
| `POST /api/submit` | 500 từ server, form không hiện lỗi | Network 500 + console error |
| `GET /api/data` | Trả về `null`, component không null-check | Console TypeError |
| `POST /api/order` | Double submit tạo 2 records | Network log 2 requests giống nhau |
| `GET /dashboard` | Redirect loop sau login | Network redirect chain |

```bash
# Khởi động fixture app
cd fixture-app && npm start   # chạy ở localhost:3001

# Chạy integration tests
npm run test:integration
```

---

## 19. Roadmap

### v1.0 — Core (single-agent)
- [x] MCP Server + 12 browser tools
- [x] Single Agent Loop + Ollama

### v2.0 — Multi-Agent Foundation
- [x] SharedState schema + Memory Compression
- [x] Explorer / Analyzer / Reporter Agent
- [x] State Graph Orchestrator
- [x] Hard-coded Guardrails
- [x] SPA/Hydration delay handling
- [x] iFrame & Shadow DOM support

### v2.1 — Antigravity Pattern
- [x] BrowserTask interface (one-shot dispatch)
- [x] ReusedSubagentId — session continuity
- [x] WebP video recording

### v3.0 — Model-agnostic + Observability + Robustness
- [x] Provider-agnostic LLM client
- [x] EventBus + ink TUI + JSONL debug log
- [x] Token budget check
- [x] BrowserTask timeout
- [x] FinishAnalysisPayload Zod validation
- [x] Auth timeout + cookie strategy
- [x] Fixture app + integration tests

### v3.1 — LangGraph + Robustness
- [x] LangGraph StateGraph + Annotation + MemorySaver/SqliteSaver
- [x] Resume sau crash từ checkpoint
- [x] Compression logic trong analyzerNode
- [x] LLM retry — exponential backoff + jitter, Retry-After header
- [x] Secret management — env variable resolution trong config
- [x] Browser context isolation per run
- [x] Selector stability score trong `browser_get_dom`
- [x] Report registry + duplicate detection + CLI commands
- [x] Graceful shutdown — SIGINT/SIGTERM handler, recording finalize

### v3.2 — Multi-Model Routing + Auto-Profiler
- [x] Config `llm` phân tầng: `default`, `analyzer`, `explorer`, `reporter`
- [x] `llm-client.ts` per-agent model resolution với fallback chain
- [x] Model Auto-Profiler — phân loại 3 Tier, override thông số hệ thống
- [x] DOM element limit per Explorer model Tier
- [x] CompressThreshold per Analyzer model Tier
- [x] TokenBudgetRatio per Agent model Tier
- [x] TaskTimeout per Explorer model Tier (local model nới timeout)
- [x] Manual Tier override trong config (`"tier": "tier1"`)
- [x] TUI Dashboard hiển thị Multi-Model + Profiler info
- [x] JSONL debug log mở rộng với `profiler_result` event và `agentModel` field
- [x] Bug Report footer cập nhật với model info đầy đủ

### v3.2.1 — Zero Hardcode *(scope hiện tại)*
- [x] `dom.ts` bỏ `slice(0, 50)` cứng → đọc từ `agentProfiles.explorer.domElementLimit`
- [x] `maybeCompress` bỏ `COMPRESS_THRESHOLD` hằng số → đọc từ `agentProfiles.analyzer.compressThreshold`
- [x] SPA wait timing (`300ms`, `100ms`) → Tier profile `spaWaitMs` / `spaFillWaitMs` + config override `browser.spaWaitMs`
- [x] LLM retry `MAX_RETRIES`, `BASE_DELAY_MS` → config `agent.maxRetries`, `agent.retryBaseDelayMs`
- [x] Duplicate detection threshold `0.85` → config `output.deduplicationThreshold`
- [x] Bổ sung nguyên tắc **Zero magic numbers** vào triết lý thiết kế

### v4.0 — Enhanced Detection
- [ ] Detect silent failure (DOM không thay đổi sau action)
- [ ] Detect infinite loading
- [ ] Screenshot diff trước/sau action
- [ ] Retry với dữ liệu test khác nhau

### v5.0 — Broader Scope
- [ ] Sitemap crawl tự động
- [ ] Multi-tab support
- [ ] CI/CD integration

---

*Specifications v3.2.1 — AI Debug Agent*
*Stack: Multi-Agent + LangGraph.js + MCP + OpenAI-compatible SDK + Playwright + ink + TypeScript*
*Changelog v2.0: Multi-Agent, Guardrails, SPA, iFrame, Memory Compression*
*Changelog v2.1: Antigravity BrowserTask, ReusedSubagentId, WebP recording*
*Changelog v3.0: Model-agnostic, Observability, Token budget, Task timeout, Payload validation, Auth strategies, Fixture app*
*Changelog v3.1: LangGraph orchestration, LLM retry, Secret management, Context isolation, Selector stability, Report registry, Graceful shutdown*
*Changelog v3.2: Multi-Model Routing (per-agent LLM config), Model Auto-Profiler (Tier 1/2/3 dynamic tuning), TUI Multi-Model display, JSONL profiler events*
*Changelog v3.2.1: Zero Hardcode — dom element limit, compress threshold, SPA wait timing, LLM retry params, dedup threshold đều configurable*