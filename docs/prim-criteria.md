# Prim Criteria

> How we decide what should be a primitive, and how we choose providers.

---

## Prim Inclusion Criteria

A service should be a prim if **all** of these are true:

| # | Criterion | Question | Cut if no |
|---|-----------|----------|-----------|
| 1 | **Agent blocker** | Does the lack of this service block agents from completing real tasks today? | Yes — if agents can already do this with existing tools, it's not a prim |
| 2 | **Signup wall** | Does using the underlying provider require human signup, KYC, or a dashboard? | Yes — if the provider already has a simple API key any agent can use, prim adds no value |
| 3 | **x402 adds value** | Does pay-per-request auth replace a painful auth/billing model (subscriptions, OAuth, manual invoicing)? | Yes — if the provider is already pay-per-request with API key auth, wrapping it adds friction |
| 4 | **Atomic scope** | Is this one coherent capability, not a business? | Yes — if operating this requires dispute resolution, insurance, quality assurance, or a marketplace, it's a company not a primitive |
| 4b | **Regulatory burden** | Does operating this require licenses, compliance programs, or legal liability beyond standard API terms? | Move to BACKLOG/OPPORTUNITY — revisit when a compliance-as-a-service provider exists |
| 5 | **Provider exists** | Is there at least one provider with a REST API that can fulfill this today? | No — move to backlog as "opportunity" if the capability is valuable but no provider exists yet |
| 6 | **Sustainable economics** | Can prim charge a markup that covers infrastructure + margin at the provider's per-request cost? | Yes — if the provider cost is too high for micropayment markup, the unit economics don't work |

### Decision flow

```
Agent blocker? ──no──→ CUT (agents can do this already)
      │ yes
Signup wall? ──no──→ CUT (provider API is already agent-friendly)
      │ yes
x402 adds value? ──no──→ CUT (wrapping adds friction, not value)
      │ yes
Atomic scope? ──no──→ CUT (this is a company, not a primitive)
      │ yes
Regulatory burden? ──yes──→ BACKLOG/OPPORTUNITY (revisit when compliance-as-a-service exists)
      │ no
Provider exists? ──no──→ BACKLOG/OPPORTUNITY
      │ yes
Sustainable economics? ──no──→ CUT (can't make money)
      │ yes
      └──→ INCLUDE (assign tier)
```

### Edge cases

- **Pattern 2 prims** (wrapping an existing internal tool like sitecap, sitegrade): Skip criteria 2-3 — the value is exposing an internal capability as an API, not simplifying provider auth.
- **Internal-only prims** (cron, pipe, vault): Skip criteria 2-3 — these are infrastructure prim runs itself, no external provider to bypass.
- **Multi-provider prims** (ring.sh wrapping Twilio+Telnyx): Extra value — prim abstracts provider choice, failover, and cost optimization. Stronger case for inclusion.

---

## Provider Selection Criteria

For each primitive, the provider is chosen by:

1. **API-native** — REST API as primary interface, not a dashboard with an API bolted on
2. **Self-service signup** — Instant API key on signup, no sales call or manual approval
3. **Pay-as-you-go** — No monthly minimums, no commitments, no annual contracts
4. **Free tier** — Enables bootstrapping without upfront cost. Critical for DeKeys pooling.
5. **Cheapest at scale** — Per-request cost must allow $0.001 floor pricing
6. **Sandbox/test mode** — Test credentials or sandbox environment for CI integration testing
7. **No human signup required** — Provider account can be provisioned programmatically (or prim manages one account)
8. **Reliability** — Uptime SLA, rate limits sufficient for production use

---

## Tier Definitions

- **T1** — Build next. Clear agent demand, viable provider, fast to ship.
- **T2** — Build eventually. High value, more complex integration.
- **T3** — Speculative. Build if demand materializes.
- **OPP** — Opportunity. No provider exists; prim could be the provider. High moat, longer timeline.
- **Live** — Deployed and operational.
- **Hold** — Package exists, not yet deployed.
- **Cut** — Removed from roadmap with rationale.
