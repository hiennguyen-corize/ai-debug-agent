---
id: race-condition
name: Race Condition
category: bug-pattern
description: Timing-dependent bugs — concurrent requests, stale closures, double submit, unmount during async
detectionSignals: [intermittent, sometimes works, double submit, stale data, flicker, concurrent, abort, cancel, debounce]
priority: 75
toolChain: [get_network_logs, get_console_logs, browser_get_dom, browser_screenshot]
hypothesisTemplates: [Concurrent requests overwrite each other, setState after unmount, Stale closure captures old value, Event fires before data loads, Double submit creates duplicate, Optimistic update not rolled back, AbortController missing]
---
# Race Condition Investigation

Race conditions are timing-dependent — they may not reproduce consistently. Key indicator: "works sometimes, fails sometimes."

## Step 1: Identify the race
Execute the action multiple times in rapid succession. Observe:
- Do results vary between attempts?
- Does fast clicking produce different outcomes than slow clicking?
- Does the issue only appear on slow connections?

## Step 2: Check concurrent requests
`get_network_logs` → look for:
- **Parallel requests to same endpoint**: Later request may resolve first, older response overwrites newer data
- **Request without AbortController**: Previous in-flight request not cancelled when new one starts (search-as-you-type, autocomplete)
- **Double POST**: Submit button clicked twice → two records created

### Common concurrent request patterns
1. **Search/filter**: User types fast, each keystroke triggers request. Response for "ab" arrives after response for "abc" → shows stale results
2. **Navigation**: User navigates away before previous page's data loads → setState on unmounted component
3. **Save button**: No disable during save → multiple identical requests

## Step 3: Check for cleanup failures
`get_console_logs` → look for:
- "Can't perform a React state update on an unmounted component" → Missing cleanup
- "Warning: An update to X inside a test was not wrapped in act(...)" → Async timing issue

### Cleanup patterns to check
- `useEffect` cleanup function (`return () => { cancelled = true }`)
- `AbortController.abort()` on unmount
- Timer/interval cleanup (`clearTimeout`, `clearInterval`)
- WebSocket/EventSource close on unmount
- Subscription unsubscribe

## Step 4: Stale closure detection
If a function uses a value that seems "stuck" on an old version:
- Event handler was created during a render with state value X
- State changed to Y, but handler still sees X (captured in closure)
- **Fix**: Use `useRef` for latest value, or functional state updater

## Step 5: Reproduce with timing control
- `browser_wait` between actions → does behavior change?
- Throttle network in browser → does issue appear more frequently?
- If yes → confirmed timing-dependent race condition

## Common solutions the fix should suggest
- **AbortController**: Cancel previous request when new one starts
- **Debounce**: Delay action until user stops typing/clicking
- **Mutex/Lock**: Prevent concurrent execution of same operation
- **Optimistic UI rollback**: If optimistic update fails, revert to server state
- **Disable during submit**: Prevent double-click
- **Request ID**: Tag each request, only use response matching latest ID
