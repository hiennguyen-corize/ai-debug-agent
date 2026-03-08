# AI Debug Agent — Roadmap

## Current State

JS runtime error debugger — strong at frontend crash bugs on public sites with source maps.

## Planned Capabilities

### P0 — High Priority

- [ ] **Auth-protected pages** — Support `--storage-state` for Playwright MCP (cookies/sessions). Allow users to provide login credentials or session files so agent can debug behind-login flows.
- [ ] **Vision/Screenshot support** — Re-enable `browser_take_screenshot` + vision-capable LLM for visual/CSS bug detection. Agent currently only sees accessibility tree.
- [ ] **Flexible viewport** — Add mobile/tablet viewport config (e.g. 375×812 iPhone, 768×1024 iPad). Many bugs are mobile-specific.

### P1 — Medium Priority

- [ ] **Performance profiling** — Integrate Lighthouse or browser Performance API to detect slow renders, large bundles, memory leaks.
- [ ] **Multi-step flow resilience** — Improve agent's ability to navigate complex flows (checkout, wizards, multi-page forms) without getting lost.
- [ ] **Race condition detection** — Add retry with timing variation, slow network simulation via Playwright.

### P2 — Nice to Have

- [ ] **Accessibility auditing** — Use accessibility tree data (already available) to flag a11y violations.
- [ ] **Cross-browser testing** — Run same investigation on Chromium, Firefox, WebKit.
- [ ] **Diff-based regression detection** — Compare screenshots/DOM snapshots between versions.
- [ ] **CI/CD integration** — Run agent as GitHub Action on PRs, auto-file issues.
