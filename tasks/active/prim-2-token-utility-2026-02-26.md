# PRIM-2: $PRIM Token Utility Design

**Date:** 2026-02-26
**Status:** pending — design doc, requires Garric decision before implementation
**Owner:** Garric + Claude
**Depends on:** L-27 (contract deployed)

## Context

$PRIM ERC-20 contract will be deployed to Base mainnet (L-27) before the repo goes public. The contract itself is just a standard ERC-20 at this stage — utility is layered on top.

This doc defines the options, trade-offs, and a recommended path. Garric decides; Claude implements.

## What $PRIM is NOT (important)

- Not a speculative meme coin (see: KellyClaudeAI)
- Not a required payment token (x402/USDC is and stays the payment layer)
- Not a governance token for a DAO that doesn't exist yet

## What $PRIM could be

### Option A: Fee discount token
Hold or burn $PRIM to get discounts on x402 calls.

- Example: hold 1,000 $PRIM → 10% discount on all primitives
- Example: burn 10 $PRIM → one free store.sh bucket creation
- Implementation: wallet.sh checks $PRIM balance on-chain at payment time, adjusts required USDC amount
- Pros: direct utility, creates demand, easy to explain
- Cons: requires on-chain balance check per request (latency), can be gamed with flash loans

### Option B: Access tier token
Hold $PRIM to unlock private beta access or premium tiers.

- Example: hold 500 $PRIM → private beta access (replaces manual allowlist)
- Example: hold 10,000 $PRIM → priority support, higher rate limits
- Implementation: wallet.sh allowlist check also verifies $PRIM balance
- Pros: very simple, creates clear demand signal during private beta
- Cons: rich agents can hold, poor agents get excluded — cuts against the utility mission

### Option C: Governance token
Hold $PRIM to vote on: new primitives to build, pricing changes, treasury use.

- Example: $PRIM holders vote on which primitive gets built next
- Example: margin % above cost is set by governance vote
- Implementation: Snapshot (off-chain gasless voting), results honored by team
- Pros: community alignment, classic open-source governance model
- Cons: premature at current stage — nobody to govern yet

### Option D: Revenue share / staking
Stake $PRIM → earn a share of protocol margin.

- Example: 20% of monthly margin distributed to stakers pro-rata
- Implementation: staking contract on Base, monthly distribution
- Pros: strongest long-term alignment for community contributors
- Cons: requires sustained revenue, regulatory gray area in some jurisdictions

### Option E: Community signal only (default until decided)
$PRIM is deployed. Utility is TBD. Being early matters.

- No mechanism yet — just hold your $PRIM
- Utility announced when community forms and has opinions
- Pros: honest, low-risk, no premature over-engineering
- Cons: "wait and see" is hard to communicate

## Recommended path

**Phase 1 (now → soft launch):** Option E. Deploy contract, hold supply, no utility yet. Be explicit: "$PRIM is the community token for prim.sh. Utility TBD via community governance."

**Phase 2 (soft launch → 6 months):** Option B (access tier) as first utility. Simple to implement, creates real demand, aligns token with the product. Allowlist becomes "hold 500 $PRIM OR get manually approved."

**Phase 3 (community-governed):** Option C + D. Once there are real holders with real opinions, move pricing and treasury decisions to $PRIM governance.

Option A (fee discounts) can be added anytime as a complement to B/C.

## Pool / liquidity guidance

- Deploy contract: L-27 (Garric, this week)
- Create pool: L-14 (after soft launch)
- Seed conservatively: $2–3K USDC initially, not $20K — impermanent loss risk
- Garric's $20K is NOT guaranteed as LP. If PRIM price drops, USDC converts to PRIM. Treat LP as a marketing/liquidity budget, not a reserve.
- Hold majority of supply. Distribute gradually: contributors, community grants, ecosystem fund.

## Supply recommendation

| Allocation | % | Notes |
|-----------|---|-------|
| Team/founder (Garric) | 40% | 2yr cliff, 4yr vest — signals long-term commitment |
| Community/ecosystem | 30% | Grants, contributors, community incentives |
| Liquidity pool | 15% | Paired with USDC at launch |
| Treasury | 15% | Future development, partnerships |

Total supply: 1,000,000,000 (1B) — large enough to feel accessible at low per-token price, small enough to not look like inflation bait.

## Decisions — LOCKED (2026-02-26)

1. **Total supply**: 1,000,000,000 (1B) ✓
2. **Treasury wallet**: `0x5599F74f951439E144F9d9118Be41F949e4406Ab` — generated via `cast wallet new` 2026-02-26. Stored in password manager as "prim.sh treasury wallet". Metadata in `/etc/prim/treasury.env` on VPS.
3. **Token symbol**: `$PRIM` ✓
4. **Decimals**: 18 ✓
5. **Phase 1 utility**: Option E — hold supply silently. Docs say "$PRIM is the community token. Utility announced when the community has opinions."

## Execution guidance

**This is a design doc — no code until Garric makes decisions above.**

Once decided, implementation is:
- L-27: deploy contract (Garric runs `POST /v1/tokens` via token.sh or hardhat script directly)
- Phase 2 utility: single agent, touches wallet.sh allowlist check only (~50 lines)
- Pool creation: L-14, guided by Claude + Garric together

Do not parallelize the design phase. Do not implement before decisions are locked.
