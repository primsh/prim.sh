# Competitors

Tracked when encountered. Not exhaustive, not maintained — just a reference.

## Landscape

| Company | URL | Positioning | Customer | Overlap with Prim | Key Difference |
|---------|-----|-------------|----------|-------------------|----------------|
| **Agentuity** | agentuity.com | "The full-stack platform for AI agents" | Developers building agents | High — both provide infra primitives (storage, compute, observability, cron, email/SMS) | Agentuity is a *deployment platform* — you push agent code to them. Prim is a *service mesh* — agents call independent APIs with x402 payment. Agentuity requires signup and wraps your runtime. Prim wraps existing services and has no accounts. |
| **Web4** | web4.ai | Unknown — site is JS-heavy, no readable content | Unknown | Unknown | Could not extract product info. Revisit. |

## How Prim is different

Most "agent infrastructure" companies build platforms where **developers deploy agents**. The developer is the customer. There's a dashboard, a CLI that authenticates you, a billing page.

Prim builds services where **the agent is the customer**. No developer in the loop at runtime. No signup, no deploy step, no dashboard. An agent with a funded wallet calls an API and gets a resource. x402 payment is the only credential.

The distinction: platforms serve developers who build agents. Prim serves agents directly.
