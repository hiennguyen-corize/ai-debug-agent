---
id: navigation
name: Navigation/Routing Bug
category: bug-pattern
description: Wrong page, redirect loop, back button broken
detectionSignals: [redirect, wrong page, 404 page, back button, route, navigation, URL mismatch]
priority: 65
toolChain: [browser_navigate, get_network_logs, browser_get_dom, browser_screenshot]
hypothesisTemplates: [Route guard redirecting incorrectly, History stack corrupted, Dynamic route params wrong, Middleware redirect loop]
---
# Navigation Bug Investigation

## Step 1: Check URL vs content
Is the URL correct but content wrong? Or is URL redirected?

## Step 2: Network redirects
`get_network_logs` → look for 301/302 chains. Redirect loop = same URL appears multiple times.

## Step 3: Client-side routing
SPA routing may not trigger network requests. Check if framework router is updating DOM correctly.

## Step 4: Back button
Navigate forward → press back → verify URL and content match expected state.
