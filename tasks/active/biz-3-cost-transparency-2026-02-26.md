# BIZ-3: Cost Transparency Doc

**Task:** Create `docs/costs.md` — a public-facing infrastructure cost breakdown with per-call cost math, margin model, and phased pricing philosophy. Link from site footer and README.

**Depends on:** BIZ-2 (expense dashboard provides the automated numbers this doc references)

**Goal:** Radical transparency as brand differentiator. Agents (and the humans building them) can see exactly what they're paying for — provider costs, infrastructure overhead, margin. No hidden fees, no "contact sales." This is the pricing equivalent of open-source.

---

## Context

### Fixed infrastructure costs (monthly)

| Item | Cost | Notes |
|------|------|-------|
| DigitalOcean VPS | $24/mo | Runs wallet, store, email, faucet, spawn, search, mem, token, domain |
| Domain (prim.sh) | ~$4.17/mo | $50/yr amortized |
| X Premium (@useprim) | $11/mo | Marketing / social presence |
| **Total fixed** | **~$39/mo** | |

### Variable provider costs (per-call, from `specs/pricing.yaml`)

| Provider | Used by | Per-call cost | x402 price | Margin |
|----------|---------|---------------|------------|--------|
| Cloudflare R2 Class A | store.sh PUT | $0.0000045 | $0.001 | ~99% |
| Cloudflare R2 Class B | store.sh GET | $0.00000036 | $0.001 | ~99% |
| Tavily search | search.sh | $0.005 | $0.01 | 50% |
| Tavily extract | search.sh | $0.005 | $0.005 | 0% (loss leader) |
| Google embedding API | mem.sh | ~$0.0001 | $0.001 | 90% |
| DigitalOcean droplet | spawn.sh | $4/mo ongoing | $0.01 one-time | -39,900% (needs recurring model) |
| NameSilo registration | domain.sh | $8-40/yr | dynamic | varies |
| Base L2 gas (deploy) | token.sh | ~$0.10 | $1.00 | 90% |
| Base L2 gas (mint) | token.sh | ~$0.01 | $0.10 | 90% |
| Base L2 gas (pool) | token.sh | ~$0.05 | $0.50 | 90% |
| Self-hosted (Stalwart, Qdrant, SQLite) | email, mem, wallet, etc. | $0 per-call | $0.001-$0.05 | 100% |

### Phased margin model

- **Beta (current):** At cost or near-cost. Goal is adoption, not revenue. Some endpoints are loss leaders (search extract, spawn provisioning).
- **Soft launch:** Small margin added. Enough to cover infra + modest runway. Transparent markup disclosed in this doc.
- **Full launch:** Community-governed pricing. Token holders vote on margin targets. All cost data stays public.

---

## Files to create / modify

### 1. Create `docs/costs.md`

New file. Sections:

1. **Philosophy** — Why we publish costs. "You deserve to know what you're paying for." Brief, brand-voice (see `BRAND.md` voice section).

2. **Infrastructure** — Fixed monthly costs table (VPS, domain, X). Note that these are shared across all primitives — fixed cost is amortized across call volume, not charged per-call.

3. **Per-call costs** — Table per primitive showing: endpoint, provider cost, x402 price, margin %. Source data from `specs/pricing.yaml`. Group by primitive. Flag risk items (spawn pass-through, search extract at-cost).

4. **How we calculate price** — Short explanation of the formula: `x402_price = provider_cost + infra_amortization + margin`. Note that infra amortization is currently $0 for most calls (fixed cost is low enough that per-call share rounds to zero at moderate volume). Show a worked example for search.sh: `$0.005 Tavily + ~$0 infra + $0.005 margin = $0.01`.

5. **Risk items** — Explicit callout of endpoints where margin is negative or zero, and what the plan is:
   - spawn.sh `POST /v1/servers`: one-time $0.01 vs $4/mo ongoing. Needs recurring billing model (future task).
   - search.sh `POST /v1/extract`: at cost, 0% margin. Accepted as loss leader for search bundle.
   - token.sh `POST /v1/tokens`: 90% margin normally but gas spikes could erode. Will add gas oracle for dynamic pricing.
   - domain.sh `POST /v1/domains/register`: dynamic pricing — margin depends on TLD wholesale cost.

6. **Margin model** — Three phases described above. Current phase clearly labeled. Future governance mechanism described at high level (no implementation details — that's a separate task).

7. **BIZ-2 reference** — Note that `bun scripts/expenses.ts` generates a live margin report from actual API usage + on-chain revenue. Link to BIZ-2 output format (once it exists). This doc is the static explainer; BIZ-2 is the live dashboard.

8. **Last updated** — Date stamp. Updated whenever `specs/pricing.yaml` changes.

Data source: Pull all per-call numbers from `specs/pricing.yaml` (single source of truth). Do not hardcode numbers that differ from the YAML — if they diverge, the doc is wrong.

### 2. Add link to `site/index.html` footer

Add a "costs" link in the `.socials` div (alongside github, discord, access request). This is the informational/meta links section, not the primitive links section.

Location: `site/index.html` line ~343-348, in the `.socials` div.

Link: `<a href="/docs/costs">costs</a>` — consistent with existing footer link style (lowercase, no color override since it's in the socials row).

Caddy routing note: The site currently serves static files. `/docs/costs` needs to resolve to `docs/costs.md` rendered as HTML, OR the doc should be `site/costs/index.html`. Decide based on how other docs are served. Check if there's a markdown renderer or if this needs to be a static HTML page. If the latter, the doc should still be authored in `docs/costs.md` and the site page would be a styled HTML version at `site/costs/index.html`.

### 3. Add link to `README.md`

Add to the links bar at the top (line ~14, alongside Website, llms.txt, Discord, @useprim):

```
<a href="https://prim.sh/docs/costs">Costs</a>
```

Also add a brief sentence in the "How It Works" section or after the Providers table: "See our full cost breakdown at [docs/costs.md](docs/costs.md)."

---

## Design decisions

- **Markdown, not HTML** — The doc lives in `docs/costs.md` so it renders nicely on GitHub. A styled HTML version for the site can be a follow-up or part of this task (depending on how docs are currently served).
- **Source of truth is `specs/pricing.yaml`** — The doc should reference it explicitly and note that the YAML is canonical. If an automated build step to generate the tables from the YAML is desired, that's a separate task (not BIZ-3 scope).
- **No auto-generation in v1** — Write the tables by hand from the YAML. Keep it simple. Auto-generation from YAML can be a future enhancement.
- **Tone** — Direct, transparent, slightly opinionated. Not corporate. Match `BRAND.md` voice: "terse, direct, slightly acerbic."

## Testing / validation

- All numbers in `docs/costs.md` match `specs/pricing.yaml` — cross-check every row
- Links from README and site footer resolve correctly
- Doc renders correctly on GitHub (standard markdown, no exotic extensions)
- Risk items section covers all endpoints where `margin_pct` is negative or zero in the YAML
- Phased margin model section is accurate to current state (beta, at-cost)

## Before closing

- [ ] Every number in `docs/costs.md` matches `specs/pricing.yaml` — spot-check at least 5 rows
- [ ] README link resolves to the doc on GitHub
- [ ] Site footer link added and visually consistent with existing socials row
- [ ] Risk items section covers: spawn pass-through, search extract, token gas, domain dynamic pricing
- [ ] Margin model labels current phase as "beta"
- [ ] "Last updated" date matches the commit date
- [ ] No provider credentials, wallet addresses, or internal IPs appear in the doc
