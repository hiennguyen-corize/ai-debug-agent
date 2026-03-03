---
description: Create a task plan. No code writing - only plan file generation.
---

# /plan - Project Planning Mode

$ARGUMENTS

---

## 🔴 CRITICAL RULES

1. **NO CODE WRITING** - This command creates plan file only
2. **Socratic Gate** - Ask clarifying questions before planning
3. **Dynamic Naming** - Plan file named based on task

---

## Task

Create a plan for the AI Debug Agent project:

```
CONTEXT:
- User Request: $ARGUMENTS
- Mode: PLANNING ONLY (no code)
- Output: {task-slug}.md (project root, dynamic naming)

NAMING RULES:
1. Extract 2-3 key words from request
2. Lowercase, hyphen-separated
3. Max 30 characters
4. Example: "mcp server tools" → mcp-server-tools.md

RULES:
1. Read specs.md for project context
2. Ask clarifying questions before planning
3. Create {task-slug}.md with task breakdown
4. DO NOT write any code files
5. REPORT the exact file name created
```

---

## Expected Output

| Deliverable | Location |
|-------------|----------|
| Task Plan | `./{task-slug}.md` |
| Task Breakdown | Inside plan file |
| Module assignments | mcp-server / mcp-client / shared |
| Verification Checklist | End of plan file |

---

## After Planning

Tell user:
```
[OK] Plan created: {slug}.md

Next steps:
- Review the plan
- Start implementation
- Or modify plan manually
```

---

## Naming Examples

| Request | Plan File |
|---------|-----------|
| `/plan mcp server tool registry` | `mcp-tool-registry.md` |
| `/plan model profiler tier system` | `model-profiler-tiers.md` |
| `/plan langgraph state schema` | `langgraph-state.md` |
| `/plan fixture app upload bug` | `fixture-upload-bug.md` |

---

## Usage

```
/plan mcp server tool registry
/plan model auto-profiler improvements
/plan langgraph checkpointing with sqlite
```
