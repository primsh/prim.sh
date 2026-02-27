# L-29: GitHub Actions — stale issues, dedupe, bot PR auto-merge

**Status**: pending
**Scope**: `.github/workflows/stale.yml`, `.github/workflows/auto-merge.yml`

## Problem

As the repo goes public, issue/PR hygiene needs automation:
1. Stale issues pile up without auto-close
2. Duplicate issues require manual triage
3. Bot PRs (dependabot, renovate) require manual merge even when CI passes

## Design

Three separate workflows (not one monolith) — each has a distinct trigger and cadence.

### Workflow 1: Stale issue/PR auto-close

**File**: `.github/workflows/stale.yml`
**Trigger**: `schedule: cron: '0 6 * * 1'` (weekly Monday 6am UTC)

Use `actions/stale@v9`:
- Issues: mark stale after 30 days of no activity, close after 7 more days
- PRs: mark stale after 14 days, close after 7 more days
- Exempt labels: `pinned`, `security`, `v1.0.0`
- Stale label: `stale`
- Stale message: "This issue has been automatically marked as stale due to inactivity. It will be closed in 7 days if no further activity occurs."

### Workflow 2: Duplicate issue detection

**File**: `.github/workflows/dedupe.yml`
**Trigger**: `issues: types: [opened]`

Approach: lightweight — don't use an AI/ML service. Use `actions/github-script@v7` to:
1. Fetch open issues (up to 100)
2. Compare new issue title against existing titles using simple normalized string overlap (lowercase, strip punctuation, check if >60% word overlap)
3. If match found, add a comment: "Possible duplicate of #N" and add `possible-duplicate` label
4. Don't auto-close — let humans decide

This is intentionally conservative. False positives are worse than missed dupes at this scale.

### Workflow 3: Bot PR auto-merge

**File**: `.github/workflows/auto-merge.yml`
**Trigger**: `pull_request: types: [opened, synchronize]`

Conditions for auto-merge (all must be true):
- PR author is `dependabot[bot]` or `renovate[bot]`
- All CI checks pass
- PR is a patch or minor version bump (not major)

Use `actions/github-script@v7`:
1. Check `context.payload.pull_request.user.login` against bot list
2. Wait for CI via `gh pr checks` (poll or use `workflow_run` trigger)
3. Parse PR title for semver bump type — dependabot titles follow `Bump <pkg> from X to Y`
4. If patch/minor and CI green: `gh pr merge --squash --auto`

For major bumps: add `needs-review` label, don't auto-merge.

## Files

| File | Purpose |
|------|---------|
| `.github/workflows/stale.yml` | Weekly stale issue/PR cleanup |
| `.github/workflows/dedupe.yml` | Duplicate issue detection on open |
| `.github/workflows/auto-merge.yml` | Auto-merge bot PRs when CI passes |

## Before closing

- [ ] `stale.yml` — test by creating a test issue, verifying label logic (can use `act` or manual trigger)
- [ ] `dedupe.yml` — test with two similarly-titled issues, verify comment appears
- [ ] `auto-merge.yml` — verify it only triggers for bot users, not human PRs
- [ ] All workflows have `permissions` scoped to minimum needed (issues: write, pull-requests: write)
- [ ] Exempt labels (`pinned`, `security`, `v1.0.0`) are respected by stale action
