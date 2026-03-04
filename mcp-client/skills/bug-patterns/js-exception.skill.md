---
id: js-exception
name: JS Exception
category: bug-pattern
description: Uncaught JavaScript errors — TypeError, ReferenceError, SyntaxError, white screen crashes
detectionSignals: [TypeError, ReferenceError, SyntaxError, RangeError, Cannot read property, undefined is not, is not a function, white screen, Uncaught, unhandled rejection, ChunkLoadError, Loading chunk]
priority: 95
toolChain: [get_console_logs, resolve_error_location, read_source_file, browser_screenshot]
hypothesisTemplates: [Null reference on async data, Missing optional chain, Hydration error, Bundle parse error, Dynamic import failed, Module not found, Infinite recursion]
---
# JS Exception Investigation

## Step 1: Capture the exact error
`get_console_logs` → find:
- Error type (TypeError, ReferenceError, SyntaxError, RangeError)
- Error message (the actual description)
- Stack trace (file:line:column)
- Whether it's caught or uncaught

## Step 2: Classify by error type

### TypeError (most common)
- `Cannot read properties of undefined/null (reading 'X')` → Accessing property on null/undefined
  - **Cause**: Async data not loaded yet, API returned null, optional field missing
  - **Fix pattern**: Optional chaining `obj?.property`, nullish coalescing `obj ?? fallback`
- `X is not a function` → Calling a non-function value
  - **Cause**: Wrong import (named vs default), library version mismatch, typo
- `Cannot set properties of undefined` → Trying to assign to undefined reference
- `Assignment to constant variable` → Trying to reassign `const`

### ReferenceError
- `X is not defined` → Variable never declared or out of scope
  - **Cause**: Import missing, typo in variable name, SSR accessing browser API
  - **Common**: `window is not defined` (SSR), `document is not defined` (SSR)

### SyntaxError
- Usually a build/transpilation issue, not runtime code
- `Unexpected token` → Malformed JSON, wrong file extension, transpiler misconfiguration

### RangeError
- `Maximum call stack size exceeded` → Infinite recursion
  - **Cause**: useEffect without deps, recursive function without base case, circular dependency

### ChunkLoadError / Loading chunk failed
- Dynamic import (`import()`) failed to fetch the chunk
  - **Cause**: Deployment replaced chunks, user has stale page, CDN cache issue
  - **Fix**: Catch at `import()` level, add error boundary, force reload on chunk error

## Step 3: Resolve source location
Extract `file:line:column` from stack trace → `resolve_error_location` → get original source file/line.

If stack trace shows minified code (single letter variables, `a.b.c`):
1. Look for `sourceMappingURL` comment in the JS file
2. `fetch_source_map` → resolve to original source
3. `read_source_file` around the error line

## Step 4: Determine trigger
- **On page load (mount)**: Data fetching / hydration / initialization issue
- **On user interaction**: Event handler / state / race condition issue
- **After delay**: Timer, animation frame, or WebSocket callback issue
- **Random/intermittent**: Race condition, memory corruption, garbage collection

## Step 5: Check for error handling
- Is there an ErrorBoundary (React) or `errorHandler` (Vue) that might be swallowing errors?
- Is there a `.catch()` that silently handles the error?
- Is `window.onerror` or `addEventListener('error')` overridden?

## White Screen Pattern
White screen = uncaught error in render tree WITHOUT error boundary.
1. `get_console_logs` → the error that killed the render
2. `browser_screenshot` → confirm white/blank page
3. Check if error occurs in root component (kills entire app) vs child (could have boundary)
