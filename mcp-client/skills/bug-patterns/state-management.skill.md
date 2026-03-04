---
id: state-management
name: State Management Bug
category: bug-pattern
description: Application state becomes inconsistent or stale
detectionSignals: [refresh fixes, stale data, wrong state, data leak between pages, cached old value]
priority: 75
toolChain: [browser_get_dom, get_network_logs, get_console_logs, browser_screenshot]
hypothesisTemplates: [Global state not reset on navigation, Cache returning stale data, Optimistic update not rolled back, Store subscription leak]
---
# State Management Investigation

## Step 1: Refresh test
Does a full page refresh fix the issue? If yes → client-side state bug, not server.

## Step 2: Navigation test
Navigate away and back — does stale data persist? Check if global store resets on route change.

## Step 3: Inspect network vs DOM
Compare API response (fresh data) with what DOM shows. Mismatch = state not synced.

## Step 4: Check cache
Look for `Cache-Control` headers, service workers, or framework-level caching (SWR, React Query staleTime).
