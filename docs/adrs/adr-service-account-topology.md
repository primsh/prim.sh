# ADR: Service Account Topology

> Prim uses two accounts per external provider — internal for prim-owned infrastructure, external for customer-provisioned resources. All prim-owned services go on internal regardless of whether they are user-facing.

**Date:** 2026-03-10
**Status:** Accepted

## Context

Prim operates both its own infrastructure and a platform that provisions resources on behalf of customers. This applies across every provider where prim manages accounts — Cloudflare, AWS, Hetzner, etc. Mixing prim-owned and customer-provisioned resources in a single account creates problems:

1. **Blast radius.** A bad API call or billing issue on customer-provisioned resources could take down prim's own services.
2. **Token scoping.** Platform automation needs broad permissions to manage arbitrary customer resources. Those tokens shouldn't have access to prim's core infrastructure.
3. **Billing clarity.** Customer-provisioned resource costs should be separable from prim's own operating costs.

## Decision

Two accounts per provider:

| Account | Naming convention | Purpose |
|---------|-------------------|---------|
| **Internal** | `internal@prim.sh` or provider equivalent | All prim-owned domains, servers, storage, DNS, and infrastructure |
| **External** | `external@prim.sh` or provider equivalent | Customer-provisioned resources managed programmatically by the prim platform |

### What goes where

**Internal** — any resource that prim owns and operates:
- prim.sh, store.sh, infer.sh, and all primitive subdomains
- Servers, workers, containers that run prim services
- DNS for all prim-owned domains
- Storage buckets, databases, KV namespaces for prim infra
- CI/CD, monitoring, and operational tooling

**External** — any resource provisioned on behalf of a prim customer:
- Custom domains connected by customers (e.g., `mycoolshop.com` via store.sh)
- DNS records managed via prim's provisioning APIs
- Servers, workers, or other resources spun up per-customer
- Customer data stores isolated from prim's own

### The rule

If prim owns it → internal. If prim manages it on behalf of someone else → external. There is no third category. "User-facing" does not mean external — `store.sh` is user-facing but prim-owned, so it's internal.

### Provider examples

| Provider | Internal | External |
|----------|----------|----------|
| **Cloudflare** | prim.sh zone, R2 buckets, Workers | Customer domains, per-customer Workers |
| **Hetzner** | VPS running prim services | Servers provisioned via spawn.sh |
| **AWS** | S3 for dl.prim.sh, SES for prim email | Customer S3 buckets via store.sh |

### API tokens / credentials

Each account gets its own scoped credentials. Internal tokens never leave prim's infrastructure code. External tokens are used only by the platform provisioning layer. No credential shares access to both accounts.

### Personal accounts

Personal projects and client work go on personal accounts, separate from any prim product accounts. Transfer client domains to client-owned accounts when ready.

## Consequences

- Two accounts per provider to manage, two sets of billing
- Clear separation means platform outages don't affect core infra
- Customer resource costs are directly attributable per provider
- Token compromise on an external account doesn't expose prim's own infrastructure
- New provider onboarding requires creating both accounts upfront
