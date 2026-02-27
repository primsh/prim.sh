# V0 MVP Launch Plan

**Goal**: Prove that a non-author human (with agent or CLI) can discover, pay for, and use a prim — end to end — on Base mainnet with real USDC.

**What this is NOT**: A public launch. No marketing, no public repo, no X posts. This is a private, controlled test with 5 friends.

---

## What Are We Testing?

**Hypothesis**: x402 payment as sole auth works. An agent or human with a funded wallet can use infrastructure primitives without signup, API keys, or GUI.

**What we learn**:
1. Does the golden path work on mainnet? (wallet create → fund → store put → store get → search)
2. Does x402 payment settle reliably on Base mainnet?
3. Can a non-author complete onboarding from the one-pager alone, without hand-holding?
4. What breaks under real-world (non-author) usage patterns?
5. Is the concept legible? Do testers "get it"?

**Success**: 3+ of 5 testers complete the golden path independently. No crashes, no stuck states, no security incidents.

**Failure**: Payment fails on mainnet. Or onboarding is so confusing nobody finishes. Or a security issue surfaces. Any of these means we stop, fix, re-test.

---

## V0 Scope: 4 Primitives

| Primitive | Why in | Risk |
|-----------|--------|------|
| **wallet.sh** | Foundation — can't do anything without it | Low |
| **store.sh** | Hero demo — ~$0.01/op, reversible, obvious utility | Low |
| **search.sh** | Stateless, no side effects, demonstrates breadth | Low |
| **feedback.sh** | Agent-native feedback loop. Free endpoint. Dogfoods the platform. | Low |

### Cut from v0

| Primitive | Why out |
|-----------|---------|
| spawn.sh | Real VPS instances at real cost. One confused tester could spin up 20 servers. Add in v0.1 with hard spend caps. |
| faucet.sh | Testnet only. Irrelevant on mainnet. Testers get funded directly. |
| email.sh | Domain warmup not done (E-4). Deliverability uncertain. |
| token.sh | Niche, $1/deploy. Not needed to test hypothesis. |
| mem.sh | Qdrant not deployed on VPS. |
| domain.sh | Custom x402 payment flow, untested registrar integration. |

---

## Beta Onboarding Flow

No credential handout. Testers onboard themselves:

```
1. Tester receives one-pager (DM or group chat)
2. Installs CLI:  curl -fsSL https://prim.sh/install | sh
3. Creates wallet:  prim wallet create
4. Shares their wallet address with you (in chat)
5. You send $3 USDC on Base to their address
6. Tester hits store.prim.sh → gets 403 (not on allowlist)
7. Tester runs:  prim access request --reason "beta tester"
8. You approve:  prim admin approve <id>
9. Tester retries → 402 → x402 payment settles → resource returned
```

**Why this flow**: It tests the REAL onboarding experience. Steps 6-8 are the production access-request flow (L-31, already built). We learn if agents/humans can navigate the 403→request→approve→retry loop. The only manual step is you sending USDC and approving — both of which you'd automate in v0.1.

---

## Access Control & Spend Caps

### v0: Manual approval only

**Do NOT auto-approve access requests.** v0 is 5 friends. You approve each one by hand:

```bash
prim admin approve <id>
```

This is the tightest possible access control — nothing happens without you explicitly saying yes.

### Per-wallet spend limits (defense in depth)

The policy engine (`packages/wallet/src/policy.ts`) already supports per-wallet limits. Every approved wallet gets a default policy:

| Limit | v0 Default | Why |
|-------|-----------|-----|
| `max_per_tx` | $0.50 | No single operation costs more than $0.50. Prevents fat-finger or runaway loops. |
| `max_per_day` | $5.00 | Daily cap per wallet. Resets at midnight UTC. A tester with $3 can't blow past $5 even if they fund more. |

Set the default policy when approving:

```bash
prim admin approve <id> --max-per-tx 0.50 --max-per-day 5.00
```

If a wallet hits the daily limit, it gets `403 policy_violation` with a clear message. They can try again tomorrow.

### Provider-side cost exposure

The real risk isn't USDC — it's provider bills (Tavily, R2). For v0 scope:

| Prim | Provider | Cost to you per op | v0 worst case (5 wallets × $5/day × 7 days) |
|------|----------|-------------------|----------------------------------------------|
| store.sh | Cloudflare R2 | ~$0.0004/op | ~$0.70 (negligible) |
| search.sh | Tavily | ~$0.001/query | ~$1.75 |
| wallet.sh | Self-hosted | $0 | $0 |
| feedback.sh | Self-hosted (SQLite) | $0 | $0 |
| **Total** | | | **~$2.50 worst case** |

x402 revenue from those same ops: ~$17.50 (you're net positive). Provider cost is not a risk at v0 scale.

### Why spawn.sh is cut (the 10K VPS scenario)

spawn.sh wraps Hetzner/DigitalOcean. A CX22 Hetzner VPS costs €4.35/month. If someone auto-approved + no daily cap + spawn.sh live: 10K VPS = €43,500/month. That's why spawn.sh is v0.1 only, gated behind:
- Manual approval (no auto-approve ever for spawn)
- `max_per_day` of $10-20 per wallet
- `allowed_primitives` field in policy (restrict wallet to specific prims)
- Hard provider-side limit (Hetzner API rate limits + account spending caps)

### Budget

| Item | Cost |
|------|------|
| 5 testers × $5 USDC (generous buffer) | $25 |
| Your dogfood wallet | $10 |
| Gas (Base L2, sub-cent per tx) | ~$1 |
| Provider costs (R2 + Tavily, worst case) | ~$3 |
| **v0 total** | **~$39** |
| **Available budget** | **$500 (Coinbase)** |
| **Remaining for v0.1+** | **~$461** |

Bridge USDC from Coinbase to Base via Coinbase Wallet or the native Base bridge. Sub-$1 fee.

---

## Feedback Collection: feedback.sh

A proper primitive, scaffolded via `pnpm create-prim`. Agents submit feedback programmatically — this dogfoods the platform and captures agent-perspective friction, not just human recall.

### Why a full primitive (not a CF Worker hack)

- `pnpm create-prim feedback` scaffolds prim.yaml, package, smoke tests, llms.txt — for free
- Gets the full middleware stack: rate limiting, structured logging, error handling
- Architecturally consistent — feedback.sh is a prim like any other
- Its own llms.txt is auto-generated and included in the aggregate `site/llms.txt`

### Endpoint

```
Base URL: https://feedback.prim.sh

POST /v1/feedback   (free — no x402 payment required)

Body:
{
  "wallet": "0x...",           // submitter wallet (optional)
  "primitive": "store.sh",     // which prim the feedback is about
  "type": "bug" | "friction" | "suggestion" | "praise",
  "message": "...",            // free text
  "context": { ... }           // optional — error codes, CLI version, etc.
}

Response (201):
{ "id": "fb_abc123", "status": "received" }
```

### Storage

SQLite on VPS (same pattern as wallet.sh allowlist DB). Simple, no external dependency.

### Discovery — agents find feedback.sh in three places

**1. llms.txt** — feedback.sh has its own llms.txt (auto-generated). Plus every other prim's llms.txt includes:

```
## Feedback
POST https://feedback.prim.sh/v1/feedback — free, no auth required.
Submit bug reports, friction points, or suggestions.
```

**2. Error responses** — every error from every prim includes `feedback_url`:

```json
{
  "error": { "code": "invalid_request", "message": "..." },
  "feedback_url": "https://feedback.prim.sh/v1/feedback"
}
```

**3. `GET /` on any prim** — the standard health response can include the feedback URL so agents always know where to report issues.

This means an agent that hits an error is one hop away from reporting it. No human in the loop.

### Admin review

```bash
prim admin feedback list              # See all feedback
prim admin feedback list --type bug   # Filter by type
```

### Build steps

```bash
pnpm create-prim                      # Interactive wizard → name: feedback
# Wire service logic: SQLite table, POST /v1/feedback, GET /v1/feedback (admin)
# Add feedback_url to x402-middleware error helper
# Update other prims' llms.txt to reference feedback.sh
pnpm gen                              # Regenerate all downstream files
# Deploy: systemd unit, Caddy route, DNS record
```

---

## Pre-Launch Gates (sequential)

Every gate must pass before proceeding to the next.

### G1: Secret scan (SEC-1)
**Owner**: you
**Time**: 2-4 hours

Run full git history scan. Triage findings. Rotate any active secrets. Even though repo stays private for v0, this is hygiene — a leaked secret is a leaked secret.

```bash
gitleaks detect --source . --log-opts="--all" --verbose
```

| Findings | Action |
|----------|--------|
| 0 true positives | Proceed |
| True positives, inactive | Clean history (BFG), proceed |
| True positives, active | Rotate IMMEDIATELY, clean history, re-scan, proceed |

### G2: Mainnet switchover (L-22)
**Owner**: you
**Time**: 1-2 hours

Checklist (all must pass):

- [ ] `PRIM_NETWORK=eip155:8453` set in `/etc/prim/wallet.env`, `/etc/prim/store.env`, `/etc/prim/search.env`
- [ ] x402 pricing validated against mainnet gas costs
- [ ] Circuit breaker tested: `prim admin pause send` → verify 503 → `prim admin resume send`
- [ ] Faucet guard: faucet.sh rejects requests when `PRIM_NETWORK` is mainnet
- [ ] Healthcheck passes: `curl https://wallet.prim.sh` → `{"service":"wallet.sh","status":"ok"}`
- [ ] Same for store.prim.sh, search.prim.sh
- [ ] Wallet allowlist reviewed — only your test wallets, no stale entries
- [ ] All VPS env files reviewed — no testnet-only values leaking into mainnet config

### G3: Dogfood (you, end-to-end on mainnet)
**Owner**: you
**Time**: 1-2 hours

Complete the exact golden path your testers will follow. Use the one-pager as your only reference. Don't skip steps.

```bash
# Fresh env — pretend you're a tester
export PRIM_HOME=$(mktemp -d)
prim wallet create
# Fund the new wallet with $3 USDC from your main wallet
# Request access, approve yourself
prim access request --reason "dogfood"
prim admin approve <id>
# Golden path
prim store create-bucket --name test-bucket
prim store put --bucket test-bucket --key hello.txt --body "hello world"
prim store get --bucket test-bucket --key hello.txt
prim search query --q "what is x402 payment protocol"
# Feedback (free, no payment)
prim feedback submit --primitive store.sh --type suggestion --message "dogfood test"
```

**Pass criteria**: Every command succeeds. x402 payment settles on-chain. Feedback submission returns 201. No errors, no timeouts, no manual workarounds.

### G4: Automated smoke test (L-36)
**Owner**: you (or CI)
**Time**: 30 min to run, assumes L-36 is already implemented

`scripts/smoke-cli.sh` passes end-to-end on mainnet. This is the scripted version of G3 — if it passes, the golden path is mechanically verified.

### G5: Build feedback.sh
**Owner**: you
**Time**: 2-3 hours

Create feedback.sh as a proper primitive:

1. `pnpm create-prim` → name: feedback, accent color, description
2. Wire service logic:
   - SQLite table: `feedback(id, wallet, primitive, type, message, context, created_at)`
   - `POST /v1/feedback` — free route, validates body, inserts, returns `{ id, status }`
   - `GET /v1/feedback` — admin-only (x-internal-key), list/filter feedback
3. Add `feedback_url` field to error helper in `@primsh/x402-middleware` so every error response includes `"feedback_url": "https://feedback.prim.sh/v1/feedback"`
4. Update llms.txt for wallet, store, search to reference feedback.sh
5. `pnpm gen` — regenerate all downstream files
6. Deploy: systemd unit (`prim-feedback.service`), Caddy route (`feedback.prim.sh`), DNS A record
7. Redeploy wallet, store, search (for the error response `feedback_url` change)
8. Smoke test: `curl -X POST https://feedback.prim.sh/v1/feedback -d '{"primitive":"store.sh","type":"bug","message":"test"}'` → 201

### G6: One-pager
**Owner**: you
**Time**: 1-2 hours

Write the one-pager. Keep it under 1 page. Structure:

```
What is prim?
  One sentence.

Install
  curl -fsSL https://prim.sh/install | sh

Quick start
  prim wallet create
  → share your address with me, I'll fund it
  → prim access request --reason "beta"
  → wait for approval (I'll approve in <1 hour)
  → prim store create-bucket --name my-bucket
  → prim store put --bucket my-bucket --key test.txt --body "hello"
  → prim store get --bucket my-bucket --key test.txt
  → prim search query --q "latest AI news"

Hit a bug? Your agent can report it:
  prim feedback submit --primitive store.sh --type bug --message "..."

Pricing
  store: $0.01/op, search: $0.005/query
  You have $5 USDC — that's 500 store ops or 1000 searches.
```

Share in beta group chat.

### G7: Private beta
**Owner**: you + 5 testers
**Time**: 1 week observation window

1. Send one-pager to 5 friends
2. Be available for questions but don't hand-hold (observe where they struggle)
3. Monitor VPS logs: `journalctl -u prim-wallet -f` for errors
4. Check feedback endpoint daily: `prim admin feedback list`
5. Check circuit breaker daily — ready to pause if anything looks wrong
6. After 1 week: review feedback submissions, review logs, decide next step

---

## Security Emphasis

### Before beta (G1-G4)

- [x] fail2ban + SSH key-only auth (SEC-1, done)
- [x] Caddy security headers (SEC-2, done)
- [x] Body-limit middleware (SEC-5, done)
- [x] Rate limiting: 60 req/min per wallet (HRD-10, done)
- [x] Structured logging with request IDs (HRD-11, done)
- [x] Fail-fast on missing env vars (HRD-12, done)
- [x] JSON parse safety (HRD-4, done)
- [x] Gitleaks in CI (done)
- [ ] Full history secret scan (G1 — SEC-1 execution)
- [ ] Mainnet env audit (G2)
- [ ] Circuit breaker verified on mainnet (G2)

### Acceptable for v0, fix before v0.1

- **HRD-16 (Zod validation)**: No runtime schema validation. Acceptable risk — beta testers are trusted friends, input is CLI-generated. Must add before expanding access.
- **Database backups**: SQLite on VPS, no off-site backup. Acceptable for beta — data is replaceable. Add R2 snapshots before v0.1.

### Non-negotiable for v0

- No secrets in git history (G1)
- Circuit breaker works and you can kill everything in 30 seconds (G2)
- Allowlist enforced — only approved wallets can transact (L-31, done)
- Rate limiting active — no single wallet can DoS the service (HRD-10, done)

---

## What's in V0 (complete list)

- wallet.sh, store.sh, search.sh, feedback.sh (4 prims, mainnet)
- `feedback_url` in all error responses + llms.txt
- Manual access approval with per-wallet spend limits
- One-pager for beta testers
- CLI install script

## What's NOT in V0

- Public GitHub repo
- Marketing (X, blog, Asher post)
- DeKeys / keys.sh
- x402 discovery manifest / MCP registry listing
- spawn.sh, email.sh, token.sh, mem.sh, domain.sh
- Whitepaper publication
- Auto-approve for access requests
- Monitoring/alerting dashboard
- Automated CI deploy

All of this is v0.1+ after we learn from the beta.

---

## Decision: What Triggers v0.1?

After the 1-week beta window:

| Outcome | Action |
|---------|--------|
| 3+ testers complete golden path, no security issues | Proceed to v0.1: add spawn.sh (with spend caps), deploy monitoring, prep for public |
| 1-2 testers complete, others stuck on onboarding | Fix onboarding, re-test with 3 new testers |
| Payment failures on mainnet | Debug x402 settlement, potentially fall back to testnet, re-test |
| Security incident (secret leak, unauthorized access) | Full stop. Rotate everything. Post-mortem. Re-gate. |
| Nobody completes (concept doesn't land) | Rethink positioning. Interview testers. Pivot or kill. |

---

## Timeline

Not calendar dates — sequential gates. Each gate blocks the next.

| Gate | Est. effort | Depends on |
|------|------------|------------|
| G1: Secret scan | 2-4 hrs | Nothing |
| G2: Mainnet switchover | 1-2 hrs | G1 |
| G3: Dogfood | 1-2 hrs | G2 |
| G4: Automated smoke | 30 min | G3, L-36 implemented |
| G5: Feedback endpoint | 2-3 hrs | G2 (needs deployed services for error response change) |
| G6: One-pager | 1-2 hrs | G3, G5 (need golden path + feedback URL) |
| G7: Private beta | 1 week | G4, G6 |

G4 and G5 can run in parallel (PARA — no file overlap).

**Total pre-beta effort**: ~2 days of focused work, assuming no blockers.
**Beta observation window**: 1 week.
**Total to v0 learnings**: ~10 days.
