---
id: spa-navigation
name: SPA Navigation
category: browser
description: Single page app navigation patterns
detectionSignals: [SPA, single page, no full reload, pushState, hash routing, client routing]
priority: 65
toolChain: [browser_navigate, browser_click, browser_wait, browser_get_dom]
hypothesisTemplates: [Route change does not trigger network request, DOM mutation replaces content]
---
# SPA Navigation Strategy

## Key Difference from Traditional
SPA navigation does NOT trigger full page loads. Content changes via DOM manipulation.

## Navigation Approach
1. `browser_click` on links instead of `browser_navigate` for internal routes
2. Wait for DOM update, NOT for network idle
3. Check URL change via `browser_get_dom` or page URL

## Waiting Strategy
- Do NOT use `networkidle` — SPA may have background polling
- Use `browser_wait` with DOM condition (specific element appears)
- Check for route transition indicators (loading bar, fade animation)

## Hash vs History Routing
- Hash: `example.com/#/about` — no server request
- History: `example.com/about` — needs server fallback for direct access
