---
id: dev-report
name: Developer Report
category: report
description: Technical bug report for developers
detectionSignals: [default]
priority: 100
toolChain: []
hypothesisTemplates: []
---
# Developer Report Format

## Structure
1. **Root Cause** — precise technical explanation
2. **Code Location** — original file:line (source-mapped)
3. **Data Flow** — component → service → API → state chain
4. **Suggested Fix** — before/after code diff
5. **Hypotheses** — table of tested/rejected hypotheses with confidence
6. **Repro Steps** — exact steps to reproduce
7. **Evidence** — console logs, network traces, screenshots
8. **Assumptions** — what was assumed during investigation

## Tone
Technical, concise, actionable. Assume reader is a developer familiar with the codebase.
