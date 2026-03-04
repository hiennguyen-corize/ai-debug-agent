---
id: silent-failure
name: Silent Failure
category: bug-pattern
description: Action completes without visible error but produces wrong result or no effect
detectionSignals: [no error, no console, no network error, wrong data, empty result, stale data, nothing happens, click does nothing]
priority: 70
toolChain: [get_console_logs, get_network_logs, get_network_payload, browser_get_dom, browser_screenshot]
hypothesisTemplates: [API returns 200 but wrong data, State update swallowed, Event handler not attached, Conditional render hiding content, CSS hiding element, Error silently caught, Promise rejected but not handled]
---
# Silent Failure Investigation

Silent failures are the hardest bugs to diagnose because there are no visible errors. The action "works" but the result is wrong or nothing happens.

## Step 1: Verify there truly are no errors
`get_console_logs` → check ALL levels (error, warn, info). Some frameworks log errors as warnings.
Look for:
- Swallowed errors: `.catch(() => {})` or `try { } catch { }` with empty handler
- Conditional errors: Error only shows in production/debug mode
- Third-party errors: Analytics/tracking script errors can mask app errors

## Step 2: Check network layer
`get_network_logs` → verify:
- **Request fired?** If no request after user action → event handler not attached, or prevented by conditional logic
- **200 but wrong data?** `get_network_payload` → inspect response body. Data may be:
  - Empty array `[]` instead of populated results
  - Wrong user's data (auth/session issue)
  - Cached stale response (check `Cache-Control`, `ETag` headers)
  - Correct data but wrong field name (API contract mismatch)

## Step 3: Check DOM visibility
`browser_get_dom` → is the expected element:
- **Present but hidden?** Check CSS: `display: none`, `visibility: hidden`, `opacity: 0`, `height: 0`, `overflow: hidden`
- **Present but off-screen?** Check position: `transform: translateX(-9999px)`, `position: absolute; left: -9999px`
- **Present but covered?** Check `z-index` — another element may be on top
- **Not present?** Conditional render evaluated to false

## Step 4: Event handler verification
If clicking a button does nothing:
1. Is the click handler attached? (missing `onClick`, `@click`, `v-on:click`)
2. Is `event.preventDefault()` or `event.stopPropagation()` blocking it?
3. Is the handler wrapped in a condition that evaluates to false?
4. Is there an invisible overlay capturing clicks instead? (modal backdrop, loading overlay)
5. Is the button actually a `<div>` without proper click handling?

## Step 5: State pipeline trace
Follow the data from source to display:
1. **API response** → does it contain the expected data?
2. **State update** → does the state store receive and process the data?
3. **Selector/computed** → does the derived state compute correctly?
4. **Render** → does the template/JSX use the correct state variable?

Common break points:
- State update dispatched but reducer/mutation has wrong key
- Computed property caches stale value
- Component receives prop but uses local state instead
- Two-way binding (`v-model`) on wrong variable
