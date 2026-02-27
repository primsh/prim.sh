# SITE-10: Wire Cloudflare Pages into GHA deploy pipeline

**Status**: pending
**Scope**: `.github/workflows/deploy.yml`, GitHub repo secrets + environments, GitHub repo variable

## Context

`prim.sh` is served by a Cloudflare Pages project named `prim-sh` (domains: `prim.sh`, `prim-sh.pages.dev`). It has no Git integration — it was deployed once, manually. Every push to `main` updates the VPS services but leaves the site stale.

This task wires Pages into the existing GHA deploy workflow so every CI-passing push to `main` deploys both targets:

- **Services** → VPS via rsync + deploy.sh (existing `deploy` job, rename to `deploy-vps`)
- **Site** → Cloudflare Pages via wrangler (new `deploy-site` job)

Both jobs run in parallel — they touch different targets with no dependency on each other.

## Design

### Job: `deploy-site`

```yaml
deploy-site:
  name: Deploy site → Cloudflare Pages
  environment: production
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Build static dist
      run: |
        mkdir -p site-dist
        # Copy all web-deliverable files; exclude server-side .ts/.py files
        rsync -a \
          --include='*/' \
          --include='*.html' --include='*.css' --include='*.js' \
          --include='*.jpg' --include='*.jpeg' --include='*.png' \
          --include='*.ico' --include='*.svg' --include='*.webp' \
          --include='*.txt' --include='*.json' \
          --exclude='*' \
          site/ site-dist/
        # Build ID for smoke check verification
        echo "$GITHUB_SHA" > site-dist/_build_id.txt

    - uses: cloudflare/wrangler-action@v4
      with:
        apiToken: ${{ secrets.CF_API_TOKEN }}
        accountId: ${{ secrets.CF_ACCOUNT_ID }}
        command: pages deploy site-dist --project-name ${{ vars.PAGES_PROJECT }}
```

### Rename `deploy` → `deploy-vps`

Rename the existing `deploy` job to `deploy-vps` for clarity. No other changes to that job.

### Job: `verify` (post-deploy smoke check)

Runs after both deploy jobs. Uses `_build_id.txt` to confirm Pages is serving the new deploy, not stale content. Retries for up to 60s to account for Pages propagation delay.

```yaml
verify:
  name: Smoke check
  needs: [deploy-vps, deploy-site]
  runs-on: ubuntu-latest
  steps:
    - name: Verify site build ID
      run: |
        expected="${{ github.sha }}"
        for i in $(seq 1 6); do
          actual=$(curl -sf https://prim.sh/_build_id.txt || echo "")
          if [ "$actual" = "$expected" ]; then
            echo "Build ID verified: $actual"
            exit 0
          fi
          echo "Attempt $i: got '$actual', waiting..."
          sleep 10
        done
        echo "Smoke check failed: expected $expected"
        exit 1
```

### GitHub Environments

Add `environment: production` to both `deploy-vps` and `deploy-site`. This:
1. Tracks deployments in GitHub UI (environment status, deployment history)
2. Scopes secrets to the environment — enabling staging to have different secrets

Existing repo-level secrets (`VPS_HOST`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`) must be **moved** to the `production` environment in GitHub Settings. New secrets (`CF_API_TOKEN`, `CF_ACCOUNT_ID`) are added there too.

### GitHub repository variable: `PAGES_PROJECT`

Add a non-secret repo variable `PAGES_PROJECT = prim-sh`. Used in the wrangler command. When staging is added, a staging environment can override this to `prim-sh` with a `--branch staging` flag (Pages preview).

## Staging design (future, no code changes needed here)

This design is staging-ready. When a staging environment is needed:

1. Create `staging` branch in repo
2. Create `staging` GitHub Environment with:
   - `VPS_HOST` = staging VPS SSH string
   - `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` = staging VPS credentials
   - `CF_API_TOKEN`, `CF_ACCOUNT_ID` = same Cloudflare account
3. Pages preview for staging: wrangler auto-creates a preview at `staging.prim-sh.pages.dev` when deploying with `--branch staging`. No new Pages project needed.
4. Add `deploy-staging.yml` triggered on push to `staging` branch, using `environment: staging` — mirrors this workflow but with `--branch staging` in the wrangler command and pointing at staging VPS.

`sync-vps.sh` remains the local quick-deploy tool for rapid iteration on API services (not site changes, which always go through GHA).

## Files

| File | Change |
|------|--------|
| `.github/workflows/deploy.yml` | Add `deploy-site` job; rename `deploy` → `deploy-vps`; add `verify` job; add `environment: production` to both deploy jobs |

## Manual steps (Garric, after code merges)

1. GitHub Settings → Environments → create `production` environment
2. Move existing repo secrets to `production` environment:
   - `VPS_HOST`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`
3. Add new secrets to `production` environment:
   - `CF_API_TOKEN` — value from local `.env` (`CF_API_TOKEN`)
   - `CF_ACCOUNT_ID` — value from local `.env` (`CF_ACCOUNT_ID`)
4. GitHub Settings → Variables (repo-level) → add `PAGES_PROJECT = prim-sh`
5. Run `workflow_dispatch` to verify before relying on auto-trigger

## Before closing

- [ ] `deploy-site` and `deploy-vps` run in parallel (no `needs:` between them)
- [ ] Static dist excludes `.ts`, `.py` files (only web-deliverable files in site-dist/)
- [ ] `_build_id.txt` written with `$GITHUB_SHA` and verified by smoke check
- [ ] `environment: production` on both deploy jobs
- [ ] `PAGES_PROJECT` used as repo var, not hardcoded in workflow YAML
- [ ] Smoke check retries up to 60s for Pages propagation
- [ ] `wrangler-action@v4` (not npx wrangler — avoids version drift)
- [ ] Verified via `workflow_dispatch` before leaving as auto-deploy
