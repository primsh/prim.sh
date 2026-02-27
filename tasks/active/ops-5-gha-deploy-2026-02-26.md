# OPS-5: GHA deploy pipeline — SSH deploy key + deploy.yml

**Status**: pending
**Scope**: `.github/workflows/deploy.yml`, GitHub repo secrets

## Problem

Deploys are manual: run `bash scripts/sync-vps.sh` locally, which rsyncs to VPS then SSHes in to run `deploy/prim/deploy.sh`. This is fragile (depends on local machine state) and has no audit trail.

## Goal

Replace manual deploy with a GitHub Actions workflow triggered on push to `main`. The workflow:
1. Runs CI checks (reuse existing `ci.yml`)
2. Rsyncs source to VPS
3. SSHes in to run the existing `deploy/prim/deploy.sh`

## Design

### Trigger

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

Push to main auto-deploys. Manual trigger via `workflow_dispatch` for ad-hoc deploys.

### Job: `deploy`

**Needs**: Reference CI workflow via `workflow_run` or inline checks. Simplest approach: `deploy.yml` calls the CI workflow first, then deploys only if CI passes.

Actually, simpler: since CI already runs on push to main, use a separate workflow that triggers after CI succeeds:

```yaml
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]
```

This ensures deploy only runs after CI passes. If CI fails, deploy is skipped.

### Steps

1. **Checkout** — need source for rsync
2. **Setup SSH** — write deploy key from secret to `~/.ssh/id_ed25519`, add VPS to `known_hosts`
3. **Rsync** — mirror `scripts/sync-vps.sh` logic but from CI runner:
   ```
   rsync -avz --delete \
     --exclude='node_modules/' --exclude='.git/' --exclude='*.db*' \
     --exclude='server.log' --exclude='.env*' --exclude='brand/assets/' \
     --exclude='research/' --exclude='specs/' --exclude='.claude/' \
     --exclude='bun.lock' \
     ./ $VPS_HOST:/opt/prim/
   ```
4. **Remote deploy** — `ssh $VPS_HOST "bash /opt/prim/deploy/prim/deploy.sh"`

### Secrets needed

| Secret | Value | Notes |
|--------|-------|-------|
| `VPS_HOST` | `root@157.230.187.207` | SSH user@ip |
| `VPS_SSH_KEY` | Ed25519 private key | Generate new keypair specifically for GHA |
| `VPS_KNOWN_HOSTS` | Output of `ssh-keyscan 157.230.187.207` | Prevents MITM prompt |

### SSH key setup (manual, Garric)

1. Generate deploy-specific key: `ssh-keygen -t ed25519 -f gha-deploy -C "gha-deploy@prim"`
2. Add public key to VPS: `ssh root@157.230.187.207 'cat >> ~/.ssh/authorized_keys'`
3. Optionally restrict key in `authorized_keys`: `command="/opt/prim/deploy/prim/deploy.sh",no-port-forwarding,no-x11-forwarding`
4. Add private key as GitHub secret `VPS_SSH_KEY`
5. Add `ssh-keyscan` output as `VPS_KNOWN_HOSTS`

### Concurrency

```yaml
concurrency:
  group: deploy
  cancel-in-progress: false
```

Only one deploy at a time. Don't cancel in-progress deploys (could leave VPS in inconsistent state). Queue instead.

## Rollback

No automated rollback in v1. If deploy breaks:
1. SSH in manually
2. `git -C /opt/prim log` to find last good commit
3. `git -C /opt/prim checkout <sha>`
4. `bash /opt/prim/deploy/prim/deploy.sh`

Future: add health check after deploy, auto-rollback if health fails.

## Files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | Deploy workflow |

## Before closing

- [ ] Workflow triggers only after CI passes (not independently)
- [ ] SSH key is deploy-specific (not a personal key)
- [ ] Rsync excludes match `scripts/sync-vps.sh` exactly
- [ ] Concurrency prevents parallel deploys
- [ ] Test with `workflow_dispatch` before relying on auto-trigger
- [ ] VPS services restart successfully after deploy
