# prim_git_wt_b_c_p

Git worktree → branch → commit → push → PR workflow. All new work in this repo uses this process.

## Arguments

`$ARGUMENTS` — task ID and/or branch description. Examples:
- `i-39 api-key-cost-tracking`
- `hrd-30 console-warn-to-logger`
- `ops-13 health-alerting`

## Instructions

### 1. Derive branch name

From `$ARGUMENTS`, build a branch name: `<scope>/<slug>`

- Scope = lowercased task ID prefix (e.g., `i`, `hrd`, `ops`, `sp`, `e`, `fc`)
- Slug = short kebab-case description (3-5 words max)
- Examples: `i/i-39-api-key-costs`, `hrd/hrd-30-console-warn`, `ops/ops-13-health-alerting`

If no task ID is given, use a descriptive scope (e.g., `fix/`, `chore/`, `feat/`).

### 2. Create worktree

```bash
git worktree add .worktrees/<branch-slug> -b <branch-name>
```

The `.worktrees/` directory is gitignored. Work happens there in isolation.

### 3. Implement the task

Read the task from `tasks/tasks.json` and its plan doc in `tasks/active/` if one exists. Make all changes inside the worktree directory.

### 4. Verify

From the worktree directory:
```bash
pnpm -r check   # lint + typecheck + test — must pass before commit
```

Fix any failures before proceeding.

### 5. Commit

Stage specific files (never `git add -A`). Write a commit message:
- Subject: imperative, ≤72 chars, no period
- Reference task ID if applicable

```bash
git add <specific files>
git commit -m "$(cat <<'EOF'
<subject line>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### 6. Push

```bash
git push -u origin <branch-name>
```

### 7. Open PR

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
- <bullet points>

## Task
<task-id> — <task description>

## Test plan
- [ ] pnpm -r check passes
- [ ] <specific verification steps>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 8. Report

Output the PR URL. Done.

## Notes

- Never push directly to `main` — always via PR
- Never use `--no-verify` or `--force` unless explicitly instructed
- If `pnpm -r check` fails, fix it — do not skip or suppress
- Worktree is left in place after the PR opens; user cleans up after merge via `git worktree remove .worktrees/<slug>`
