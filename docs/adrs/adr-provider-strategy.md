# ADR: Cloud Provider Strategy

> Two-provider model — Cloudflare (DNS + storage) and DigitalOcean (compute).

**Date:** 2026-02-24
**Status:** Accepted

## Context

AgentStack has 27+ primitives. Which cloud providers should back them? Evaluated AWS, GCP, Azure, DigitalOcean, Vultr, Linode, Hetzner, and Cloudflare across VPS, DNS, object storage, reseller TOS, and API quality.

### Primitive infrastructure mapping

Only 3 of 27 primitives bind to a cloud provider API:

| Primitive | Needs | Provider-dependent? |
|-----------|-------|-------------------|
| **spawn.sh** | VPS provisioning API | Yes — wraps provider's compute API |
| **dns.sh** | DNS management API | Yes — wraps provider's DNS API |
| **store.sh** | S3-compatible object storage | Yes — wraps provider's storage API |

Everything else either wraps a third-party service (ring.sh→Telnyx, pay.sh→Stripe, seek.sh→Brave, ship.sh→EasyPost, etc.) or just needs a VPS to run Bun + SQLite (wallet.sh, relay.sh, auth.sh, hive.sh, etc.).

### Providers evaluated

| | VPS | DNS | Obj Storage | Reseller TOS | API complexity | DNS cost |
|---|---|---|---|---|---|---|
| **DigitalOcean** | Droplets ($4+) | Yes | Spaces (S3) | Partner Pod (5-25%) | Simple REST | Free |
| **Vultr** | Yes ($2.50+) | Yes | Yes (S3) | Opaque, case-by-case | Simple REST | Free |
| **Linode/Akamai** | Yes ($5+) | Yes | Yes (S3) | Partner program | Simple REST | Free |
| **Hetzner** | Cheapest ($3.50+) | Yes | Yes (S3) | **Prohibits resale** | Simple REST | Free |
| **Cloudflare** | No VPS | Yes | R2 (S3, no egress) | N/A | Best DNS API | Free |
| **AWS** | EC2 ($3+) | Route 53 | S3 | MSP program | Very complex | $0.50/zone/mo |
| **GCP** | Compute ($7+) | Cloud DNS | Cloud Storage | Partner program | Complex | $0.20/zone/mo |
| **Azure** | VMs ($4+) | Azure DNS | Blob | CSP program | Complex | $0.50/zone/mo |

### Why not hyperscalers (AWS/GCP/Azure)?

1. **DNS costs money per zone.** dns.sh creates zones on-demand at $0.05. Provider fees of $0.20-0.50/mo per zone destroy margins after month 1.
2. **API complexity.** AWS alone has IAM, STS, region-scoped endpoints, SigV4 request signing. Not a thin wrapper — it's a project.
3. **Signup friction.** Identity verification, org setup, billing alarms. AgentStack's value is "no signup" — the backing provider shouldn't require one either.

They belong as SP-6 provider options for enterprise agents ("deploy to my AWS account"), not as the provider AgentStack resells.

### Why not a single provider?

No single provider is best at everything:
- **Cloudflare** has the best DNS API (free, batch operations, DNSSEC) but no VPS.
- **DigitalOcean** has the clearest reseller program but DNS lacks batch operations and DNSSEC.
- **Vultr** is cheapest but partner program is opaque ("acceptance alone does not authorize resale").
- **Hetzner** TOS prohibits reselling without written consent — compliance risk.

### Why Cloudflare for DNS?

- Free (no per-zone, per-record, or per-query charges)
- Batch operations: create/update/delete multiple records atomically in one API call. Critical for D-2 mail-setup (5 records at once). Neither DO nor Vultr supports this.
- DNSSEC support
- Most mature DNS API (zone lifecycle, record types: A/AAAA/CNAME/MX/TXT/SRV/CAA/NS)
- Global anycast network

### Why DigitalOcean for compute?

- **Partner Pod reseller program**: structured tiers with published discounts (5%/15%/25%). Vultr's program is individually negotiated with no published terms.
- **Reseller-friendly**: explicit partner path for building platforms on DO infra. Hetzner TOS §5 prohibits reselling.
- **Simple REST API**: clean, well-documented, OpenAPI spec published. Official SDKs for Go, Python, Ruby, plus Terraform provider.
- **$4/mo smallest Droplet**: competitive with Vultr ($2.50 at the very low end, but $4 for comparable specs).
- **15 regions**: sufficient for v1. Vultr has 32 but that's not a v1 blocker.

## Decision

| Provider | Service | Primitives | Cost |
|----------|---------|------------|------|
| **Cloudflare** | DNS API | dns.sh | Free |
| **Cloudflare** | R2 Object Storage | store.sh (future) | Free first 10GB, $0.015/GB/mo after, no egress fees |
| **DigitalOcean** | Droplets | spawn.sh (launch provider) | $4/mo smallest, 5-25% partner discount |
| **DigitalOcean** | Droplets | AgentStack's own infra (wallet, relay, auth, etc.) | 1-2 Droplets, $6-24/mo each |

**Total fixed cost to run AgentStack**: ~$12-48/mo (1-2 DO Droplets for all Bun services). DNS and R2 free at low volume.

**Per-agent variable cost** (spawn.sh provisioning): $4+/mo per Droplet, passed through with margin.

## Consequences

- spawn.sh launch provider changes from Hetzner → DigitalOcean, resolving TOS risk. Hetzner stays as SP-6 provider option.
- dns.sh wraps Cloudflare API. No abstraction needed for v1 (Cloudflare's free tier eliminates cost pressure to switch).
- store.sh (backlog) targets Cloudflare R2. No egress fees is a strong differentiator vs S3/Spaces.
- Two billing relationships (Cloudflare + DO), but Cloudflare is free for DNS/low-volume R2.
- R-1 (Stalwart deployment) targets a DO Droplet instead of Hetzner VPS.
- DO Partner Pod enrollment needed before launch to formalize reseller terms.

## Revisit triggers

- If Cloudflare changes DNS pricing (currently free, no indication of change)
- If DO Partner Pod terms change or a competitor offers significantly better margins
- If agent demand requires regions DO doesn't cover (Vultr's 32 regions become relevant)
- If hyperscaler enterprise agents need "deploy to my account" (SP-6 adds AWS/GCP providers)
