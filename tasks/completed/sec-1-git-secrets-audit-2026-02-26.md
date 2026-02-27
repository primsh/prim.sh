# SEC-1: Audit git history for leaked secrets

**Status**: done — 2026-02-27
**Scope**: git history (all branches), `.gitleaks.toml`

## Problem

Before making the repo public, we need to verify no secrets (API keys, passwords, .env values, private keys) exist anywhere in the git history. A single leaked secret in a historical commit is exploitable even if it's been removed from HEAD.

## Known risk areas

From the codebase:
- Stalwart Mail Server admin password
- Relay-wrapper API key
- Hetzner API token (spawn.sh)
- x402 facilitator private key / wallet seed
- DigitalOcean API token
- Any `.env` file contents that were accidentally committed
- SSH keys

## Tool choice

**gitleaks** (v8). Reasons:
- Purpose-built for git history scanning
- Supports custom rules via `.gitleaks.toml`
- Can scan full history (`--log-opts=--all`)
- JSON output for programmatic processing
- Well-maintained, used by GitHub themselves

Alternative considered: `trufflehog` — heavier, cloud-oriented. Overkill for a single repo.

## Execution plan

### Phase 1: Scan

```bash
# Install
brew install gitleaks

# Full history scan (all branches, all commits)
gitleaks detect --source . --log-opts="--all" --report-format=json --report-path=gitleaks-report.json

# Verbose mode to see what it finds
gitleaks detect --source . --log-opts="--all" --verbose
```

### Phase 2: Triage

Review each finding:
- **True positive**: an actual secret that was or is live
- **False positive**: a test value, example placeholder, or non-secret

For each true positive:
1. Document: which secret, which commit, which file
2. Determine if the secret is still active (can it be used?)
3. Rotate the secret immediately if active

### Phase 3: Remediate (if true positives found)

Two options depending on severity:

**Option A: BFG Repo Cleaner** (preferred for simple cases)
```bash
# Remove specific files from all history
bfg --delete-files '.env' --no-blob-protection
bfg --replace-text passwords.txt --no-blob-protection
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

**Option B: git filter-repo** (for surgical removal)
```bash
# Remove specific strings from all history
git filter-repo --replace-text <(echo 'ACTUAL_SECRET_VALUE==>***REDACTED***')
```

**Critical**: Either option rewrites history. All collaborators must re-clone. Force push required. This is acceptable pre-public (no external collaborators yet).

### Phase 4: Prevention

Add `.gitleaks.toml` to repo root with:
- Prim-specific patterns (env var names, key formats)
- Allowlist for known false positives (test fixtures, example values)

Add pre-commit hook or CI check:
```yaml
# In ci.yml (after I-4 restructure)
- name: Secret scan
  run: gitleaks detect --source . --log-opts="HEAD~1..HEAD" --verbose
```

This scans only the new commits in each push, keeping CI fast.

## Files

| File | Purpose |
|------|---------|
| `.gitleaks.toml` | Custom rules + allowlist |
| `gitleaks-report.json` | Scan output (DO NOT commit) |
| `.github/workflows/ci.yml` | Add secret scan step (after I-4) |

## Decision table: remediation approach

| Findings | Secret active? | Action |
|----------|---------------|--------|
| 0 true positives | N/A | Add `.gitleaks.toml` + CI step, done |
| True positives | No (already rotated) | BFG/filter-repo to clean history, add prevention |
| True positives | Yes (still live) | Rotate IMMEDIATELY, then clean history, add prevention |

## Before closing

- [ ] `gitleaks detect --source . --log-opts="--all"` returns 0 findings (or only allowlisted false positives)
- [ ] All active secrets found have been rotated
- [ ] `.gitleaks.toml` committed with project-specific rules
- [ ] CI step added to scan new commits on each push
- [ ] `gitleaks-report.json` is in `.gitignore`
- [ ] If history was rewritten: all collaborators notified to re-clone

---

## Scan result — 2026-02-27

**Tool**: gitleaks 8.30.0
**Scope**: all branches, 431 commits, ~6.94 MB
**Findings**: 0

One flag in `--no-git` (working tree) mode:
- `deploy/email/.env` — `STALWART_API_KEY=msk_relay_aN8xKd2mPqVr5Tw9`
- **Not a finding**: file is gitignored (line 19 of `.gitignore`), never committed. Confirmed via `git log --all -S "msk_relay_..."` — no hits.

OpenZeppelin test fixture strings (ERC-721/1155 error names) also flagged in `--no-git` mode — false positives, vendored library code.

**Verdict**: Clean. No rotation required. SEC-1c is N/A.
