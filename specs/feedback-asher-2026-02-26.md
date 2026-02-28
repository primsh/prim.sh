# Feedback: Asher (2026-02-26)

Source: Direct review of prim.sh during private beta.

## Positive

- x402 flow is seamless (402 → sign → retry → done)
- Real infra behind primitives — actual DO droplets, actual R2 storage, actual search results
- llms.txt approach: zero to full CRUD in minutes, no docs site or SDK tutorial needed
- Primitive selection is well-chosen foundation, not a feature list for a pitch deck

## Actionable

1. **CLI gap hurts** — getting started says "use prim CLI" but it doesn't exist as installable package yet. Had to write raw HTTP scripts. Most agents/humans will bounce.
2. **Bucket lookup by ID, not name** — names should resolve too.
3. **Stale docs** — search.prim.sh is live but docs say "not yet deployed". Stale docs erode trust fast.
4. **Private beta gate undercuts promise** — pitch is "no signup, no KYC" but then 403 + manual approval. Faucet rate limits may be sufficient protection.
5. **No balance check** — burned USDC across 10+ calls, no idea what's left without checking on-chain. A simple balance endpoint would help agents budget.

## Quote

> This is the kind of thing that looks small until you realize what it enables. An autonomous agent with $50 in USDC could provision servers, store data, search the web, and send emails — no human in the loop. That's a real unlock. The primitives just need to keep shipping and the onboarding needs to match the "zero friction" promise.
