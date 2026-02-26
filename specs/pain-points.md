# Pain Points — Manual Tasks Agents Can't Do (Yet)

Every entry here is friction an agent hits when trying to operate autonomously. Each maps to a potential primitive or feature.

## Format

```
### <short description>
- **Context:** When does this come up?
- **Friction:** What's manual about it?
- **Primitive:** Which prim.sh service would solve it?
- **Date:** When observed
```

---

### Create a GitHub org
- **Context:** Setting up a new project, open-sourcing code
- **Friction:** GitHub orgs can only be created via web GUI. No API, no CLI (`gh` can't do it). Requires human clicking through a form.
- **Primitive:** corp.sh (org/entity creation)
- **Date:** 2026-02-25

### Create a GitHub repo (org-owned)
- **Context:** After org exists, need to create repo under it
- **Friction:** `gh repo create` works — this one is actually automatable. But org creation blocks it.
- **Primitive:** Already solvable via GitHub API once org exists
- **Date:** 2026-02-25

### Register an npm org/scope
- **Context:** Publishing packages under a scoped namespace (@primsh/*)
- **Friction:** Must be done via npmjs.com web GUI. CLI `npm org` only manages members, can't create orgs.
- **Primitive:** id.sh (identity/registry management)
- **Date:** 2026-02-25

### Provision a VPS
- **Context:** Need a server to deploy services
- **Friction:** Currently manual (DO dashboard or API token setup). spawn.sh solves this once deployed — bootstrap problem.
- **Primitive:** spawn.sh (self-hosting chicken-and-egg)
- **Date:** 2026-02-25

### Wire DNS records
- **Context:** Pointing subdomains to servers
- **Friction:** Cloudflare dashboard or API. domain.sh solves this once deployed — another bootstrap problem.
- **Primitive:** domain.sh
- **Date:** 2026-02-25

### Set secrets/env vars on a server
- **Context:** Deploying services that need API tokens, keys
- **Friction:** SSH + manual file creation. No secure secret injection pipeline.
- **Primitive:** vault.sh
- **Date:** 2026-02-25

### Rotate credentials on a live server
- **Context:** After a leak or as routine security hygiene
- **Friction:** SSH to server, update config, restart service. Manual and error-prone.
- **Primitive:** vault.sh
- **Date:** 2026-02-25

### Check if a token ticker is available
- **Context:** Deploying an ERC-20, want to avoid symbol collision
- **Friction:** Manual BaseScan/CoinGecko search. token.sh has no search endpoint.
- **Primitive:** seek.sh or token.sh `GET /v1/tokens/search?symbol=X`
- **Date:** 2026-02-25

### Connect repo to Cloudflare Pages
- **Context:** Deploying a static site
- **Friction:** CF dashboard GUI only for initial setup. API exists but complex.
- **Primitive:** spawn.sh (static hosting variant)
- **Date:** 2026-02-25

### Set GitHub branch protection rules
- **Context:** Requiring CI to pass before merge
- **Friction:** GUI or `gh api` with complex JSON payload. Not ergonomic.
- **Primitive:** auth.sh (policy enforcement)
- **Date:** 2026-02-25

### Fund a wallet with mainnet USDC
- **Context:** Agent needs USDC to pay for primitives
- **Friction:** Requires fiat onramp (Coinbase, exchange), KYC, bank transfer. Agents can't do any of this.
- **Primitive:** pay.sh (fiat bridge)
- **Date:** 2026-02-25

### Monitor email deliverability / register with Google Postmaster Tools
- **Context:** Agent sends email via email.sh, needs to know if it's landing in spam or being blocked
- **Friction:** Google Postmaster Tools requires a human to log into a web GUI, add the domain, copy a DNS verification token, and check dashboards manually. No API. Apple has no equivalent at all.
- **Primitive:** email.sh feature (deliverability monitoring endpoint) or watch.sh. Postmaster Tools has a read-only API for already-verified domains — could surface reputation/spam data via email.sh. But initial domain verification is GUI-only.
- **Date:** 2026-02-25

### GUI-only services: agents can't click buttons
- **Context:** Many critical operations are only available through web GUIs — Google Postmaster Tools, npm org creation, GitHub org creation, Cloudflare Pages initial setup, etc.
- **Friction:** No API exists. Agent must ask a human to perform the action manually. Blocks autonomous operation.
- **Primitive:** browse.sh (hosted Playwright/Browserbase, x402 per action) + vault.sh (credential storage) + auth.sh (OAuth broker). The three compose: auth.sh gets tokens → vault.sh stores them → browse.sh drives the GUI. This is the stack that unlocks GUI automation.
- **Deeper problem:** Even with browse.sh, most platforms require human identity verification to create accounts (Google, AWS, GitHub, Stripe). Agents can act *on behalf of* a human's account (delegated OAuth), but can't create their own. This is a platform policy constraint, not a technical one.
- **Date:** 2026-02-25

### Create a GitHub Personal Access Token
- **Context:** Deploying a service that needs to call the GitHub API (e.g., creating issues for agent feedback). Agent needed a PAT with `repo` scope.
- **Friction:** GitHub PATs can only be created via web GUI (Settings → Developer Settings → Personal Access Tokens). No API, no CLI. Agent had to stop and ask the human to generate the token manually.
- **Primitive:** auth.sh (OAuth/token broker) or vault.sh (credential provisioning). An agent-accessible token minting flow that can request scoped API access to platforms the human has already authorized.
- **Date:** 2026-02-26
