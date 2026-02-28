# CI Setup Guide

This guide covers everything needed to run the prim CI pipeline in a fork. Basic CI requires no secrets at all. Deployment, AI review, and bot workflows require additional setup.

---

## Required GitHub Secrets

All secrets are configured under **Settings > Secrets and variables > Actions** in your repository.

| Secret Name | Used By | How to Obtain | Required for Basic CI? |
|-------------|---------|---------------|------------------------|
| `VPS_HOST` | deploy.yml | SSH `user@host` string for your VPS (e.g. `root@203.0.113.1`) | No — deploy only |
| `VPS_SSH_KEY` | deploy.yml | Ed25519 private key — see SSH key setup below | No — deploy only |
| `VPS_KNOWN_HOSTS` | deploy.yml | Output of `ssh-keyscan <VPS_IP>` | No — deploy only |
| `CLOUDFLARE_API_TOKEN` | deploy.yml | Cloudflare API token with Pages:Edit permission | No — deploy only |
| `CLOUDFLARE_ACCOUNT_ID` | deploy.yml | Cloudflare account ID (found in the dashboard sidebar) | No — deploy only |
| `R2_RELEASES_ACCESS_KEY_ID` | release.yml | R2 API token access key ID | No — release only |
| `R2_RELEASES_SECRET_ACCESS_KEY` | release.yml | R2 API token secret access key | No — release only |
| `CF_ACCOUNT_ID` | release.yml | Cloudflare account ID (same value as `CLOUDFLARE_ACCOUNT_ID`, stored separately) | No — release only |
| `PRIM_CI_APP_ID` | review.yml, ci-heal.yml, rebase.yml, auto-merge.yml | GitHub App ID — see GitHub App setup below | No — bot workflows |
| `PRIM_CI_PRIVATE_KEY` | review.yml, ci-heal.yml, rebase.yml, auto-merge.yml | GitHub App private key (PEM) — see GitHub App setup below | No — bot workflows |
| `ANTHROPIC_API_KEY` | review.yml, ci-heal.yml, rebase.yml | Anthropic API key from [console.anthropic.com](https://console.anthropic.com) | No — AI review only |

**Repository variable** (Settings > Secrets and variables > Variables):

| Variable Name | Used By | Value |
|---------------|---------|-------|
| `PAGES_PROJECT` | deploy.yml | Your Cloudflare Pages project name (e.g. `prim-sh`) |

`GITHUB_TOKEN` is automatically provided by GitHub Actions and requires no configuration.

---

## GitHub App Setup

Several bot workflows (auto-merge, code review, CI self-heal, auto-rebase) push commits or enable merge queue actions. They use a GitHub App token rather than `GITHUB_TOKEN` because GitHub's loop-prevention logic ignores `GITHUB_TOKEN` pushes — they do not trigger downstream CI runs. An App token push does trigger CI normally, which is required for the auto-merge flywheel to work.

### Creating the App

1. Go to **Settings > Developer settings > GitHub Apps** in your GitHub account or org.
2. Click **New GitHub App**.
3. Set a name (e.g. `my-fork-ci`), homepage URL (any URL), and disable webhooks.
4. Grant these repository permissions:
   - **Contents**: Read and write
   - **Pull requests**: Read and write
   - **Checks**: Read and write
5. Set **Where can this GitHub App be installed?** to "Only on this account".
6. Create the app and note the **App ID** shown on the app settings page.
7. Scroll to **Private keys** and click **Generate a private key**. Save the downloaded `.pem` file.

### Installing the App

1. From the app settings page, click **Install App**.
2. Install it on the forked repository.

### Adding Secrets

1. Store the **App ID** as `PRIM_CI_APP_ID` in your repository secrets.
2. Store the contents of the `.pem` file as `PRIM_CI_PRIVATE_KEY` in your repository secrets.

---

## Workflow Overview

### `ci.yml` — CI (REQUIRED)

Runs on every push to `main` and every pull request. Executes lint, typecheck, test, gen check, dependency audit, safeguards (large file and local path detection), commit lint, and secret scanning via gitleaks. This is the core quality gate — all required branch protection checks come from this workflow. No secrets needed.

### `deploy.yml` — Deploy (OPTIONAL)

Triggers after CI passes on `main`, or manually via `workflow_dispatch`. Deploys API services to a VPS via rsync and SSH, then deploys the marketing site to Cloudflare Pages in parallel. A smoke check job verifies the deployed build ID after both targets complete. Requires `VPS_HOST`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and the `PAGES_PROJECT` repository variable. Only relevant if you are running the actual prim services.

### `review.yml` — Code Review (OPTIONAL)

Triggers on every PR open or push, and on `@claude` comments in PR threads. Invokes Claude Code via `anthropics/claude-code-action` to review diffs for security issues, logic bugs, architectural violations, and missing test coverage. If Claude finds a fixable issue, it pushes a fix directly to the branch. Requires `ANTHROPIC_API_KEY` and `PRIM_CI_APP_ID` / `PRIM_CI_PRIVATE_KEY`. Skipped automatically for commits from the CI bot itself.

### `ci-heal.yml` — CI Self-Heal (OPTIONAL)

Triggers via `workflow_run` whenever CI fails on a PR branch. Fetches the failed job logs, then invokes Claude Code to diagnose and fix the issue (lint errors, type errors, test failures, stale generated files). Pushes the fix and CI reruns automatically. Requires `ANTHROPIC_API_KEY` and `PRIM_CI_APP_ID` / `PRIM_CI_PRIVATE_KEY`.

### `rebase.yml` — Auto-Rebase (OPTIONAL)

Triggers on every push to `main` and via `workflow_dispatch`. Finds all open PRs that have merge conflicts with `main`. For clean merge conflicts it resolves them automatically with `git merge`; for real code conflicts it invokes Claude Code to resolve conflict markers. Requires `ANTHROPIC_API_KEY` and `PRIM_CI_APP_ID` / `PRIM_CI_PRIVATE_KEY`. A 15-second delay is built in to allow GitHub to recalculate mergeability after `main` moves — use `workflow_dispatch` as a fallback if this is insufficient.

### `auto-merge.yml` — Auto-Merge (OPTIONAL)

Triggers on every PR open or synchronize event. Enables squash auto-merge on the PR so it merges automatically once all required CI checks pass. Labels major dependency version bumps (`needs-review`) and skips auto-merge for those. Requires `PRIM_CI_APP_ID` / `PRIM_CI_PRIVATE_KEY`. Without this workflow, PRs must be merged manually.

### `release.yml` — Release (OPTIONAL)

Triggers on version tag pushes (`v*`). Builds the keystore CLI as a JS bundle and as compiled platform binaries (darwin-arm64, darwin-x64, linux-x64, linux-arm64), generates checksums, uploads everything to a Cloudflare R2 bucket, and creates a GitHub Release. Requires `R2_RELEASES_ACCESS_KEY_ID`, `R2_RELEASES_SECRET_ACCESS_KEY`, and `CF_ACCOUNT_ID`. Only relevant if you are publishing prim CLI releases.

### `stale.yml` — Stale (OPTIONAL)

Runs on a weekly cron (Mondays at 06:00 UTC) and via `workflow_dispatch`. Marks issues stale after 30 days of inactivity and closes them after 7 more days. Marks PRs stale after 14 days and closes them after 7 more. Uses the built-in `GITHUB_TOKEN` — no additional secrets needed.

### `dedupe.yml` — Dedupe Issues (OPTIONAL)

Triggers when a new issue is opened. Compares the new issue title against all open issues using word overlap (Jaccard similarity, 60% threshold). If a likely duplicate is found, it posts a comment and adds a `possible-duplicate` label. Uses the built-in `GITHUB_TOKEN` — no additional secrets needed.

---

## Minimal Fork Setup

For basic CI — lint, typecheck, tests, gen check, dependency audit, safeguards, and secret scan — **no secrets are required**. Fork the repo, open a pull request, and `ci.yml` runs entirely with public GitHub Actions. All required branch protection checks are covered.

Secrets are only needed if you want:

- **Deployment to a VPS**: `VPS_HOST`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`
- **Deployment to Cloudflare Pages**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PAGES_PROJECT` variable
- **AI-powered code review**: `ANTHROPIC_API_KEY`, `PRIM_CI_APP_ID`, `PRIM_CI_PRIVATE_KEY`
- **AI-powered CI self-healing**: `ANTHROPIC_API_KEY`, `PRIM_CI_APP_ID`, `PRIM_CI_PRIVATE_KEY`
- **Auto-merge and auto-rebase bots**: `PRIM_CI_APP_ID`, `PRIM_CI_PRIVATE_KEY`
- **CLI release publishing**: `R2_RELEASES_ACCESS_KEY_ID`, `R2_RELEASES_SECRET_ACCESS_KEY`, `CF_ACCOUNT_ID`

If you only want the bot workflows without AI (auto-merge and auto-rebase minus Claude conflict resolution), you only need the GitHub App secrets — not `ANTHROPIC_API_KEY`.

---

## SSH Deploy Key Setup

If you are deploying to a VPS, generate a dedicated SSH key pair (do not reuse an existing key):

```bash
ssh-keygen -t ed25519 -f gha-deploy -C "gha-deploy@your-fork"
```

Install the public key on the VPS:

```bash
ssh root@<VPS_IP> "cat >> ~/.ssh/authorized_keys" < gha-deploy.pub
```

Collect the known hosts fingerprint:

```bash
ssh-keyscan <VPS_IP>
```

Add the three secrets to your repository:
- `VPS_SSH_KEY` — contents of `gha-deploy` (the private key)
- `VPS_KNOWN_HOSTS` — output of `ssh-keyscan` above
- `VPS_HOST` — your SSH connection string, e.g. `root@203.0.113.1`

Delete the local key files after storing them:

```bash
rm gha-deploy gha-deploy.pub
```

---

## Self-Hosting Environment Variables

If you are running the full prim stack on your own VPS, each service reads environment variables from `/etc/prim/<service>.env`. The following variables are required on the VPS itself (not GitHub secrets):

| Variable | Service | Description |
|----------|---------|-------------|
| `PRIM_PAY_TO` | All services | EVM wallet address that receives x402 payments |
| `PRIM_INTERNAL_KEY` | wallet.sh | Internal service key for authenticated internal calls |
| `PRIM_NETWORK` | All services | Chain identifier — `eip155:8453` (mainnet) or `eip155:84532` (testnet) |
| `WALLET_ENCRYPTION_KEY` | wallet.sh | AES-256 key for encrypting stored wallet private keys |
| `STALWART_API_URL` | email.sh | Base URL of the Stalwart Mail Server REST API |
| `STALWART_API_TOKEN` | email.sh | Admin token for the Stalwart REST API |
| `HETZNER_API_TOKEN` | spawn.sh | Hetzner Cloud API token for VPS provisioning |
| `GATE_FUND_KEY` | gate.sh | Private key of the wallet used to fund new agent wallets |
| `GATE_CODES` | gate.sh | Comma-separated list of valid invite codes |
| `DATABASE_URL` | store.sh | SQLite database path for key-value storage |

These values are never committed to the repository and are not GitHub Actions secrets — they live exclusively on the VPS in `/etc/prim/`.
