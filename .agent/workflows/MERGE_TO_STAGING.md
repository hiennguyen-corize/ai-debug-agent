---
description: Merge develop into staging for promotion. Pull, merge locally, build verify, create PR, then reset.
---

# Merge Develop → Staging Workflow

**Use this workflow when:**

- Features/fixes merged into `develop` are ready for staging
- User says "merge lên staging", "promote to staging", or similar

---

## Workflow Steps

### 1. Save Current Branch & Pull Latest

```bash
# Save where we are
ORIGINAL_BRANCH=$(git branch --show-current)

# Pull latest develop
git checkout develop
git pull origin develop

# Pull latest staging
git checkout staging
git pull origin staging
```

### 2. Merge Develop into Staging (Local Only)

```bash
git merge develop
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
- Reset staging: `git reset --hard origin/staging`

### 4. Reset Local (Undo Merge)

> ⚠️ **DO NOT push staging directly.** The local merge was only to verify the build. Now reset and create a PR instead.

```bash
# Reset staging to remote state (undo local merge)
git reset --hard origin/staging

# Cleanup build log
rm -f build.log

# Go back to original branch
git checkout $ORIGINAL_BRANCH
```

### 5. Create PR on GitHub

```bash
gh pr create \
  --base staging \
  --head develop \
  --title "Merge develop into staging" \
  --body "## Build Output
\`\`\`
$BUILD_OUTPUT
\`\`\`"
```

> The PR will be reviewed and merged on GitHub. **Never push directly to staging.**

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
- Reset local staging after verification (undo merge)
- Let GitHub handle the actual merge via PR

---

## Agent Checklist

- [ ] Saved original branch
- [ ] Pulled latest `develop` and `staging`
- [ ] Merged `develop` into `staging` locally (no conflicts)
- [ ] Build passed (`pnpm build`)
- [ ] Captured last 10 lines of build output
- [ ] Reset local staging to `origin/staging`
- [ ] Created PR (develop → staging) with build output
- [ ] Returned to original branch
