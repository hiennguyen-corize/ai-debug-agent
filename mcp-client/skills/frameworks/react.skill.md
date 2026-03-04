---
id: react
name: React Framework
category: framework
description: React 18/19 debugging strategies — hooks, state, rendering, performance
detectionSignals: [react, __REACT_DEVTOOLS, _reactRootContainer, data-reactroot, react-dom]
priority: 80
toolChain: [browser_get_dom, get_console_logs, browser_screenshot, get_network_logs]
hypothesisTemplates: [React state not updating, useEffect dependency missing, Component unmount race condition, Stale closure in event handler, Hydration mismatch, Infinite re-render loop, ErrorBoundary not catching]
---
# React Investigation Playbook

## Detection Markers
- `__REACT_DEVTOOLS_GLOBAL_HOOK__` in window
- `_reactRootContainer` on root div
- `data-reactroot` attribute
- `react-dom` or `react.production` in network requests

## React 19 Specifics
- **`use()` hook**: Replaces `useEffect` + `useState` for data fetching. If app uses `use()`, look for missing `<Suspense>` boundaries around components that await promises
- **React Compiler**: Auto-memoization — if bug only appears in production, check if compiler optimization breaks a pattern that violates Rules of React. Temporarily disable with `"use no memo";`
- **Concurrent Rendering**: Default in React 19. Non-urgent updates should use `startTransition`. Look for visual tearing or inconsistent UI during transitions
- **Security (CVE-2025-55182)**: RSC Flight protocol RCE vulnerability — check React version, must be ≥19.0.1

## Common Bug Patterns

### State Bugs
- **Stale closure**: Event handler captures old state value. Fix: functional updater `setState(prev => prev + 1)` or `useRef` for latest value
- **Direct mutation**: `user.name = "Mark"` won't trigger re-render. Must use `setUser(prev => ({...prev, name: 'Mark'}))`
- **useState replaces, not merges**: Unlike class `setState`, hooks replace the entire value. Forgetting spread causes lost fields
- **Incorrect initialization**: `useState(undefined)` then accessing `user.name` → crash. Initialize with correct shape: `useState({ name: '', email: '' })`
- **Large state objects**: Single large object re-renders entire component tree. Break into focused `useState` calls

### useEffect Bugs
- **Missing dependency array**: Effect runs after every render → infinite loop or performance death
- **Stale dependencies**: Value used in effect but not in dependency array → uses outdated closure value
- **Object dependencies**: Passing object directly triggers effect on every render because reference changes. Use primitive values or `useMemo`
- **No cleanup**: Subscriptions/timers/event listeners not cleaned up → memory leak on unmount
- **Async function as callback**: `useEffect(async () => {...})` is wrong — async returns Promise, not cleanup function. Create async function inside and call it
- **Overuse for derived state**: If value can be computed from props/state directly, don't use useEffect. Use `useMemo` or compute inline

### Render Issues
- **White screen**: Uncaught error in render tree without ErrorBoundary
- **Falsy 0 rendering**: `{count && <Component />}` renders `0` when count is 0. Use `{count > 0 && <Component />}`
- **Missing key on lists**: `{items.map(item => <Card />)}` without `key` causes ghost state, DOM reuse bugs, incorrect animations
- **Suspense boundary missing**: Components using `React.lazy()` or `use()` need `<Suspense>` wrapper

### Performance
- **Unnecessary re-renders**: Parent re-render cascades to all children. Use `React.memo` for pure components
- **Inline objects/functions in JSX**: `<Button onClick={() => {}} style={{}} />` creates new reference every render
- **Large DOM trees**: >1500 nodes = layout thrashing

## Debugging Priority Tools
1. `get_console_logs` — React dev warnings are extremely informative (missing key, deprecated API, effect cleanup)
2. `browser_get_dom` — check component structure, verify elements exist
3. `get_network_logs` — data fetching issues, failed API calls
4. `browser_screenshot` — visual verification of render state

## Key Console Warnings to Look For
- "Each child in a list should have a unique 'key' prop"
- "Cannot update a component while rendering a different component"
- "Can't perform a React state update on an unmounted component"
- "Maximum update depth exceeded" (infinite loop)
- "Text content does not match server-rendered HTML" (hydration)
- "Warning: validateDOMNesting" (invalid HTML nesting)
