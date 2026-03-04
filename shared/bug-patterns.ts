/**
 * Bug Pattern Catalogue — 10 patterns from spec §10b.
 * Used by Scout node to seed hypotheses based on signals.
 */

export type BugPattern = {
  id: string;
  name: string;
  signals: string[];
  hypothesisTemplates: string[];
  investigationStrategy: string[];
};

export const BUG_PATTERNS: readonly BugPattern[] = [
  {
    id: 'api-error',
    name: 'API Error',
    signals: ['network 4xx', 'network 5xx', 'console error HTTP', 'response error message'],
    hypothesisTemplates: [
      'Request thiếu required field',
      'Auth token hết hạn hoặc thiếu',
      'Server validation fail',
    ],
    investigationStrategy: [
      'get_network_logs → tìm request status ≥ 400',
      'get_network_payload → đọc request + response body',
      'So sánh request body với successful request',
      'Source map → tìm code build request body',
    ],
  },
  {
    id: 'silent-failure',
    name: 'Silent Failure',
    signals: ['no network after action', 'no console error', 'no UI change after click'],
    hypothesisTemplates: [
      'Event handler không được attach',
      'Guard condition ngăn action',
      'Promise rejected không có catch',
    ],
    investigationStrategy: [
      'browser_screenshot trước/sau action',
      'get_console_logs → tìm warning ẩn',
      'get_network_logs → verify không có request',
      'browser_get_dom → check disabled, button type',
      'Source map → tìm event handler guard conditions',
    ],
  },
  {
    id: 'js-exception',
    name: 'JS Exception / Crash',
    signals: ['TypeError', 'ReferenceError', 'Cannot read property', 'white screen', 'component not rendered'],
    hypothesisTemplates: [
      'Null/undefined access — data chưa load',
      'Array method trên non-array',
      'Hydration mismatch (SSR)',
    ],
    investigationStrategy: [
      'get_console_logs → lấy full stack trace',
      'resolve_error_location → tìm file gốc',
      'read_source_file → đọc code xung quanh lỗi',
      'get_network_logs → kiểm tra data API response shape',
    ],
  },
  {
    id: 'race-condition',
    name: 'Race Condition / Timing Bug',
    signals: ['inconsistent behavior', 'double submit', 'stale data', 'state update after unmount'],
    hypothesisTemplates: [
      'Double submit — không có debounce/loading guard',
      'State update sau component unmount',
      'Stale closure — function capture giá trị cũ',
    ],
    investigationStrategy: [
      'Click nhanh 2 lần → get_network_logs → đếm requests',
      'Navigate ngay sau action → get_console_logs → tìm unmounted warning',
      'Source map → tìm async handler → check isMounted guard',
    ],
  },
  {
    id: 'state-management',
    name: 'State Management Bug',
    signals: ['data correct first time wrong second', 'refresh fixes', 'data leaks between views'],
    hypothesisTemplates: [
      'State không reset khi navigate',
      'Cache stale — không invalidate sau mutation',
      'Shared mutable state giữa instances',
    ],
    investigationStrategy: [
      'Navigate đi → navigate lại → browser_get_dom → so sánh',
      'Mutation → get_network_logs → check refetch',
      'Source map → tìm store/slice → đọc reset/invalidation logic',
    ],
  },
  {
    id: 'infinite-loading',
    name: 'Infinite Loading',
    signals: ['spinner persists', 'skeleton persists', 'loading indefinitely'],
    hypothesisTemplates: [
      'Loading state không set false khi error',
      'Request không bao giờ được gọi',
      'Response format không match expected',
    ],
    investigationStrategy: [
      'get_network_logs → có request không? Status?',
      'get_network_payload → response đúng shape không?',
      'browser_get_dom → trigger element có render/disabled không?',
      'Source map → tìm loading state setter → tìm tất cả nơi set false',
    ],
  },
  {
    id: 'navigation',
    name: 'Navigation / Routing Bug',
    signals: ['redirect sai', 'URL thay đổi UI không đổi', 'back button broken', 'deep link broken'],
    hypothesisTemplates: [
      'Redirect sau action trỏ sai URL',
      'Route guard không cho vào dù đã auth',
      'History stack bị manipulate sai',
    ],
    investigationStrategy: [
      'browser_navigate trực tiếp → observe redirect chain',
      'get_network_logs → check auth request + response',
      'Source map → tìm router guard/middleware → đọc redirect conditions',
    ],
  },
  {
    id: 'form-input',
    name: 'Form / Input Bug',
    signals: ['validation not working', 'submit does nothing', 'input data lost', 'field rejects input'],
    hypothesisTemplates: [
      'Submit handler không được gọi — wrong button type',
      'Controlled input không update state',
      'Validation pass nhưng data sai — parse/trim error',
    ],
    investigationStrategy: [
      'browser_fill → browser_submit → get_network_logs → có request?',
      'browser_get_dom → check form structure, button type',
      'Source map → tìm form submit handler → đọc validation logic',
    ],
  },
  {
    id: 'file-upload',
    name: 'File Upload / Media Bug',
    signals: ['upload no response', 'progress stuck', 'file rejected silently', 'preview broken'],
    hypothesisTemplates: [
      'File size vượt limit — server 413 UI không handle',
      'CORS block upload đến CDN',
      'File type validation sai — accept vs MIME mismatch',
    ],
    investigationStrategy: [
      'browser_upload_file nhỏ → observe response',
      'browser_upload_file lớn dần → tìm ngưỡng fail',
      'get_network_logs → upload đến same origin vs CDN',
      'Source map → tìm upload handler → đọc size/type checks',
    ],
  },
  {
    id: 'performance',
    name: 'Performance / Memory Bug',
    signals: ['slow over time', 'memory increasing', 'interaction lag', 'Maximum update depth exceeded'],
    hypothesisTemplates: [
      'Event listener không cleanup',
      'Interval/timeout không clear',
      'Infinite re-render — useEffect deps sai',
    ],
    investigationStrategy: [
      'browser_get_dom → ghi nhận element count',
      'Repeat action 5 lần → browser_get_dom lại → element count tăng?',
      'get_console_logs → tìm Maximum update depth warning',
      'Source map → tìm useEffect, setInterval → check cleanup return',
    ],
  },
] as const;
