# L-12: Install script (`curl prim.sh | sh`) + per-primitive wrappers

**Status:** pending
**Depends on:** L-11 (binaries must exist on GitHub Releases)
**Blocks:** L-36 (launch readiness — agents need to install the CLI)

## Context

Install script already exists at `site/install.sh` (69 lines). Downloads binary from GitHub Releases, installs to `~/.prim/bin/prim`, adds to PATH in `.bashrc`/`.zshrc`.

## Decisions

### 1. GitHub org name

`site/install.sh` line 6 references `useprim/prim.sh`. Memory doc says GitHub org is `primsh` (repo: `primsh/prim.sh`).

**Action:** Verify which is correct. Update `GITHUB_REPO` variable in install.sh to match.

### 2. Per-primitive wrappers — skip for v1

TASKS.md mentions "per-primitive install wrappers" (`curl prim.sh/wallet/install.sh | sh`). This is unnecessary complexity for launch:
- Agents discover the CLI via `llms.txt` which documents `curl prim.sh | sh`
- All primitives are subcommands of `prim` — one install covers everything
- Per-primitive aliases (`alias wallet='prim wallet'`) add confusion, not value

**Decision:** Ship the single `curl prim.sh | sh`. Revisit per-primitive wrappers only if agents struggle with the subcommand pattern.

### 3. Checksum verification — add it

Install scripts that download binaries over HTTPS should verify integrity. Pattern:

```
curl binary → curl binary.sha256 → verify → install
```

**Requires:** release.yml generates SHA256 checksums alongside binaries (e.g., `prim-darwin-arm64.sha256`).

## Changes

### Phase 1: Release workflow generates checksums

**File:** `.github/workflows/release.yml`
**Change:** After `bun build`, generate checksum:

```bash
sha256sum dist/prim-${target} > dist/prim-${target}.sha256
```

Upload `.sha256` files as additional release artifacts.

### Phase 2: Update install.sh

**File:** `site/install.sh`

Changes:
1. Fix `GITHUB_REPO` to correct org/repo
2. Add checksum verification after download:
   - Download `${BINARY}.sha256` from same release
   - Verify with `sha256sum -c` (Linux) or `shasum -a 256 -c` (macOS)
   - Abort if mismatch
3. Add `--fail-with-body` or `-f` to curl calls (fail on HTTP errors instead of saving error HTML as binary)
4. Add `set -euo pipefail` if not already present

### Phase 3: Verify end-to-end

Test on at least 2 platforms:
- macOS (local): `curl -fsSL https://prim.sh/install.sh | sh`
- Linux (VPS): `curl -fsSL https://prim.sh/install.sh | sh`

Verify:
- Correct binary downloaded for OS/arch
- Checksum passes
- `prim --version` works after install
- PATH is set (new shell session)

### Phase 4: Landing page mention

Ensure `site/agentstack/index.html` (or wherever the hero CTA is) includes install command. Also verify `site/llms.txt` documents the install flow (it already does per L-30).

## Serving

`site/install.sh` is served by Cloudflare Pages at `https://prim.sh/install.sh`. No routing changes needed — CF Pages serves static files directly.

Verify after deploy: `curl -fsSL https://prim.sh/install.sh | head -5` returns the script, not HTML.

## Before Closing

- [ ] `GITHUB_REPO` matches actual org/repo
- [ ] Checksum verification works (tamper a checksum, verify it fails)
- [ ] `curl prim.sh/install.sh | sh` works on macOS
- [ ] `curl prim.sh/install.sh | sh` works on Linux (VPS)
- [ ] `prim --version` works in a fresh shell after install
- [ ] `prim wallet --help` works
- [ ] install.sh deployed to Cloudflare Pages and accessible at `https://prim.sh/install.sh`
