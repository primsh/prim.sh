# ADR: Cloudflare Account Topology

> Prim uses two Cloudflare accounts — internal for prim-owned infrastructure, external for customer-provisioned resources. All prim-owned services (domains, workers, DNS) go on internal regardless of whether they are user-facing.

**Date:** 2026-03-10
**Status:** Accepted

## Context

Prim operates both its own infrastructure (prim.sh, store.sh, infer.sh, domains.prim.sh) and a platform that provisions resources (domains, DNS, workers) on behalf of customers. Mixing these in a single Cloudflare account creates problems:

1. **Blast radius.** A bad API call or billing issue on customer-provisioned resources could take down prim's own domains.
2. **Token scoping.** Platform automation needs broad permissions to manage arbitrary customer domains. Those tokens shouldn't have access to prim's core infrastructure.
3. **Billing clarity.** Customer-provisioned resource costs should be separable from prim's own operating costs.

## Decision

Two Cloudflare accounts:

| Account | Email | Purpose |
|---------|-------|---------|
| **Internal** | `internal@prim.sh` | All prim-owned domains, workers, DNS, and infrastructure |
| **External** | `external@prim.sh` | Customer-provisioned domains, DNS records, and workers managed programmatically by the prim platform |

### What goes where

**Internal** — any domain or resource that prim owns and operates:
- prim.sh, store.sh, infer.sh, domains.prim.sh
- Cloudflare Workers that run prim services
- DNS for all prim-owned domains
- R2 buckets, KV namespaces, etc. for prim infra

**External** — any resource provisioned on behalf of a prim customer:
- Custom domains connected by store.sh users (e.g., `mycoolshop.com`)
- DNS records managed via prim's domain provisioning API
- Workers or other resources spun up per-customer

### The rule

If prim owns the domain → internal. If prim manages it on behalf of someone else → external. There is no third category. User-facing does not mean external — `store.sh` is user-facing but prim-owned, so it's internal.

### API tokens

Each account gets its own scoped API token. Internal tokens never leave prim's infrastructure code. External tokens are used only by the platform provisioning layer.

## Consequences

- Two accounts to manage, two sets of billing
- Clear separation means platform outages don't affect core infra
- Customer resource costs are directly attributable
- Token compromise on the external account doesn't expose prim's own domains
