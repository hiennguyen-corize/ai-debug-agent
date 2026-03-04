---
id: performance
name: Performance Issue
category: bug-pattern
description: Slow rendering, memory leaks, degrading performance
detectionSignals: [slow, performance, memory leak, jank, lag, unresponsive, long task]
priority: 55
toolChain: [get_console_logs, get_network_logs, browser_get_dom, browser_screenshot]
hypothesisTemplates: [Large DOM tree, Unoptimized re-renders, Memory leak from event listeners, Blocking network requests]
---
# Performance Investigation

## Step 1: Network waterfall
`get_network_logs` → identify slowest requests. Blocking resources delay render.

## Step 2: DOM size
`browser_get_dom` → count elements. >1500 nodes = potential DOM bloat.

## Step 3: Console checks
`get_console_logs` → look for performance warnings, deprecation notices.

## Step 4: Time-based degradation
Interact with page for extended period → does performance worsen? If yes → memory leak (event listeners, intervals, subscriptions not cleaned up).
