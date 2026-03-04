---
id: infinite-loading
name: Infinite Loading
category: bug-pattern
description: UI stuck in loading state — spinner persists, skeleton never resolves, progress bar frozen
detectionSignals: [spinner, skeleton, loading, stuck, pending, infinite load, never loads, perpetual loading, progress bar stuck]
priority: 80
toolChain: [get_network_logs, get_console_logs, browser_get_dom, browser_wait, browser_screenshot]
hypothesisTemplates: [API request never completes, Loading state not cleared on error, Promise never resolves, WebSocket connection dropped, Suspense fallback stuck, Conditional render blocks content, Error handler not clearing loading flag]
---
# Infinite Loading Investigation

## Step 1: Check pending requests
`get_network_logs` → look for:
- **Request still pending**: Request sent but no response received
  - Check timing: >30s = likely timeout
  - Check if OPTIONS preflight succeeded but actual request pending (CORS)
- **No request at all**: Loading state set but no API call triggered
  - Data fetching logic has a conditional that evaluated to false
  - API URL is undefined/null → fetch never fires

## Step 2: Check for swallowed errors
`get_console_logs` → look for:
- **Unhandled Promise rejection**: API failed but `.catch()` doesn't clear loading state
- **Error in data transformation**: Data arrived but processing threw, loading stays true
- **Framework-specific**: React Suspense fallback stuck because child component threw during render

### Common error-not-clearing-loading patterns:
```
// BAD: loading never cleared on error
setLoading(true)
const data = await fetch(url)  // throws!
setLoading(false)  // never reached

// GOOD: always clear loading
try { setLoading(true); ... } finally { setLoading(false) }
```

## Step 3: Wait and verify
`browser_wait` 10-15 seconds → `browser_get_dom` + `browser_screenshot`:
- Is loading indicator STILL present?
- Did content load but loading indicator not removed? (indicator not conditionally rendered)
- Did error message appear after timeout?

## Step 4: Classify the cause

| Symptom | Likely Cause |
|---------|-------------|
| Request pending indefinitely | Server not responding, timeout not configured |
| Request completed, still loading | Error handler doesn't clear loading flag |
| No request fired | Fetch condition never met, URL construction failed |
| Request completed with 200 | Response handler crashes during data processing |
| Intermittent | Race condition between set/clear loading |
| Only on slow connection | Request timeout too short |
| Only on initial load | SSR data not available, hydration issue |

## Step 5: Check framework-specific causes
- **React Suspense**: Child component's promise never resolves → fallback shown forever
- **Next.js loading.tsx**: Page-level loading component shown during navigation, data fetch hangs
- **Vue async setup**: `<Suspense>` wrapper + `async setup()` → component hangs if async never resolves
- **SPA route transition**: Navigation loading bar frozen because route guard never calls `next()`
