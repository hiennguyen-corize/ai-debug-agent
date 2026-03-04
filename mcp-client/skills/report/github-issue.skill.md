---
id: github-issue
name: GitHub Issue
category: report
description: Formatted as a GitHub issue with labels
detectionSignals: [github]
priority: 50
toolChain: []
hypothesisTemplates: []
---
# GitHub Issue Format

## Structure
- **Title**: `[Bug] <concise description>`
- **Labels**: `bug`, severity label (`critical`/`high`/`medium`/`low`), component label
- **Body**:
  - **Description**: 1-2 sentence summary
  - **Expected Behavior**: What should happen
  - **Actual Behavior**: What happens instead
  - **Steps to Reproduce**: Numbered list
  - **Environment**: Browser, URL, timestamp
  - **Root Cause Analysis**: Technical details (if found)
  - **Suggested Fix**: Code snippet or approach
  - **Evidence**: Screenshots, console output

## Tone
Clear, reproducible, actionable. Written for issue triagers and developers.
