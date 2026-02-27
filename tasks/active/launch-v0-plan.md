# v0 Launch Plan — First Paying Agents

## Goal

Real USDC flowing through prim endpoints. Agents paying for infrastructure. Everything else is downstream of this.

## Milestones

| # | Milestone | What it proves |
|---|-----------|---------------|
| M1 | Mainnet live | Prim accepts real money |
| M2 | First transaction | The full loop works (agent → x402 → USDC → resource) |
| M3 | Private beta | Other people's agents pay for prim services |
| M4 | DeKeys live | Supply side scales without you |
| M5 | Public launch | Repo open, community beta, Asher announces |

---

## M1: Mainnet switchover

**Blocker:** L-22 (security checklist)

**Security checklist** (write this, then flip the switch):

- [ ] Rate limits reviewed per prim (no endpoint allows unbounded calls)
- [ ] x402 pricing validated against mainnet gas costs
- [ ] Circuit breaker tested (wallet.sh pause/resume works on mainnet config)
- [ ] All env files on VPS reviewed — no testnet-only values that break on mainnet
- [ ] `PRIM_NETWORK=eip155:8453` set in all `/etc/prim/*.env` files
- [ ] Redeploy all services via `deploy/prim/deploy.sh`
- [ ] Healthcheck passes for all live prims on mainnet config
- [ ] faucet.sh disabled or mainnet-guarded (it should reject mainnet requests — verify)
- [ ] Wallet allowlist reviewed (no stale test wallets with elevated access)

**Estimated effort:** Half a day. The services are thin wrappers — the security surface is small.

**Deliverable:** `curl https://search.prim.sh/v1/search` returns 402 on Base mainnet.

---

## M2: First transaction (dogfood)

**Who:** Your Claude Code session via prim MCP server.

**Setup:**
1. Fund a wallet with $5 USDC on Base mainnet
2. Configure prim MCP server in Claude Code (`prim mcp` on stdio)
3. Use `search` tool during a normal coding session

**First transaction:**
```
Claude Code → prim MCP server → search.prim.sh POST /v1/search
  → x402: $0.001 USDC on Base mainnet
  → Tavily returns results
  → you just used your own product
```

**Why search.sh:** Stateless, cheapest endpoint ($0.001), zero setup beyond wallet funding. Instant gratification.

**Stretch:** Also test store.sh (create bucket, upload file) and spawn.sh (provision server, verify it boots, delete it). These prove the x402 flow works across different prim types.

**Estimated effort:** 1-2 hours after M1.

**Deliverable:** On-chain USDC transaction from your wallet to prim's payTo address.

---

## M3: Private beta

**Who:** 5-10 people you know who use LLMs and agents. OpenClaw power users.

**Onboarding flow:**
1. You create a wallet for each beta user (`prim wallet create`)
2. You fund each wallet with $2-5 USDC on Base
3. You send them the wallet file + a one-pager: what prim is, how to configure MCP, what to try
4. They configure their agent (Claude Code, Cursor, or raw REST)
5. They use prims as part of their normal workflow

**Total cost:** $20-50 in USDC for 10 beta users. You're footing the bill.

**What you're looking for:**
- Does the x402 flow work for someone who isn't you?
- Which prims do they actually use? (search? store? spawn?)
- Where does onboarding break?
- What do they wish existed?
- Do they hit rate limits, confusing errors, or silent failures?

**Feedback channel:** Direct messages, or a private Discord/Mattermost channel.

**One-pager contents:**
- What prim is (3 sentences)
- How to install (`curl -fsSL prim.sh | sh`)
- How to import their wallet (`prim wallet import <file>`)
- How to start MCP server (`prim mcp`)
- 3 things to try: search for something, store a file, check wallet balance
- Known limitations (testnet gas estimation might be off, some prims are WIP)
- How to give feedback

**Estimated effort:** 1 day to prepare wallets + one-pager. Then ongoing as feedback comes in.

**Deliverable:** 5+ distinct wallet addresses transacting on mainnet.

---

## M4: DeKeys

**Depends on:** M3 (you need beta users to contribute keys)

**Build:** keys.sh per `tasks/active/dk-1-dekeys-plan.md` (Phases A-D)

**First DeKeys transaction:**
1. You contribute a Tavily key
2. A beta user contributes a Serper key
3. Unset search.sh's hardcoded key, restart
4. Both users' agents search via the pool
5. Both earn credits from each other's usage

**What you're looking for:**
- Does the proxy layer work without exposing keys?
- Is pool selection fast enough? (should be <10ms overhead)
- Do credits accrue correctly?
- Do beta users understand the concept? (contribute keys, earn credits)

**Estimated effort:** 1-2 weeks for keys.sh build + integration.

**Deliverable:** Two different contributed keys serving proxy requests. Credits in the ledger.

---

## M5: Public launch

**Depends on:** M3 feedback incorporated, M4 working

**Launch day checklist:**

- [ ] GitHub repo goes public (`primsh/prim`)
- [ ] README updated with getting started guide
- [ ] llms.txt current and accurate
- [ ] Landing page (`prim.sh`) updated with live status badges
- [ ] Asher posts about prim on Mattermost (OpenClaw community)
- [ ] X post from @useprim with hero image (`>||>` spray paint)
- [ ] Register with x402 service catalog (Coinbase bazaar)
- [ ] Submit MCP tools to any available registries
- [ ] `.well-known/x402` discovery manifest live at prim.sh

**Discovery manifest** (define the standard before anyone else):
```json
// prim.sh/.well-known/x402
{
  "name": "prim.sh",
  "description": "The agent-native stack",
  "services": [
    {
      "name": "search.sh",
      "endpoint": "https://search.prim.sh",
      "llms_txt": "https://search.prim.sh/llms.txt",
      "pricing": { "POST /v1/search": "$0.001" }
    },
    ...
  ],
  "network": "eip155:8453",
  "payTo": "0x..."
}
```

If other x402 services adopt this format, prim defined the discovery standard.

**Estimated effort:** 1 day prep, then it's a coordinated launch moment.

---

## Timeline

```
Week 1    M1 mainnet + M2 first transaction
Week 2    M3 private beta (prepare wallets, one-pager, onboard 5-10 people)
Week 2-3  Collect feedback, fix what breaks
Week 3-4  M4 DeKeys build (keys.sh Phase A + B)
Week 4    M4 DeKeys first transaction (Phase D)
Week 5    M5 public launch (repo public, Asher post, x402 discovery)
```

Five weeks from today to public launch with a working key economy.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Mainnet security issue | Funds at risk | Security checklist is short — surface area is small (thin wrappers) |
| Beta users don't engage | No feedback | Pre-fund wallets, remove all friction. 5 engaged users > 50 dormant ones |
| DeKeys takes longer than 2 weeks | Launch delayed | Launch M5 without DeKeys. It's compelling without the key economy — add it post-launch |
| Provider keys get revoked | Pool goes empty | Fallback to hardcoded keys (Phase B design already supports this) |
| Someone forks the repo on day 1 | Competition | The network (wallets, reputation, pool) can't be forked. Let them fork the code. |

## What's NOT in this plan

- Additional prims (email, domain, token, mem — all built, deploy when ready)
- CLI binary distribution (GitHub Releases — already done)
- Paid marketing
- Fundraising
- Legal entity setup
- Mainnet provider cost optimization
- Whitepaper publication (publish after DeKeys is live, not before)
