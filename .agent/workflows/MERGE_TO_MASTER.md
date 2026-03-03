---
description: Merge staging into master for production release. Pull, merge locally, build verify, create PR, then reset.
---

# Merge Staging → Master Workflow

**Use this workflow when:**

- Staging is verified and ready for production
- User says "merge lên master", "promote to production", or similar

---

## Workflow Steps

### 1. Save Current Branch & Pull Latest

```bash
# Save where we are
ORIGINAL_BRANCH=$(git branch --show-current)

# Pull latest staging
git checkout staging
git pull origin staging

# Pull latest master
git checkout master
git pull origin master
```

### 2. Merge Staging into Master (Local Only)

```bash
git merge staging
```

**If merge conflicts:**
- ⏸️ Stop and notify user
- DO NOT force resolve

### 3. Build Verification

```bash
pnpm build > build.log 2>&1
BUILD_EXIT_CODE=$?

# Capture last 10 lines of build output
BUILD_OUTPUT=$(tail -n 10 build.log)
```

**If build fails (`$BUILD_EXIT_CODE != 0`):**
- ⏸️ Stop and notify user
- Reset master: `git reset --hard origin/master`

### 4. Reset Local (Undo Merge)

> ⚠️ **DO NOT push master directly.** The local merge was only to verify the build. Now reset and create a PR instead.

```bash
# Reset master to remote state (undo local merge)
git reset --hard origin/master

# Cleanup build log
rm -f build.log

# Go back to original branch
git checkout $ORIGINAL_BRANCH
```

### 5. Create PR on GitHub

```bash
gh pr create \
  --base master \
  --head staging \
  --title "Merge staging into master" \
  --body "## Build Output
\`\`\`
$BUILD_OUTPUT
\`\`\`"
```

> The PR will be reviewed and merged on GitHub. **Never push directly to master.**

---

## Safety Rules

❌ **NEVER:**

- Push directly to `staging` or `master`
- Force push to any branch
- Skip build verification
- Resolve merge conflicts without user approval

✅ **ALWAYS:**

- Pull latest before merging
- Verify build passes locally before creating PR
- Reset local master after verification (undo merge)
- Let GitHub handle the actual merge via PR

---

## Agent Checklist

- [ ] Saved original branch
- [ ] Pulled latest `staging` and `master`
- [ ] Merged `staging` into `master` locally (no conflicts)
- [ ] Build passed (`pnpm build`)
- [ ] Captured last 10 lines of build output
- [ ] Reset local master to `origin/master`
- [ ] Created PR (staging → master) with build output
- [ ] Returned to original branch
