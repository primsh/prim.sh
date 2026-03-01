# ADR: MCP Transport — stdio over hosted

> `@primsh/mcp` runs client-side via stdio, not as a hosted service at `mcp.prim.sh`. x402's signing model requires the agent's private key to remain local.

**Date:** 2026-02-28
**Status:** Accepted

## Context

prim.sh uses x402 (EIP-3009 + EIP-712) for payment. The protocol works as follows:

1. Agent requests a resource
2. Server returns 402 with price
3. Agent signs a USDC transfer authorization **locally** using its private key
4. Agent retries with the `Payment-Signature` header (signature, not key)
5. Server forwards signature to facilitator for on-chain settlement

The private key **never leaves the agent's machine**. This is a core security property of x402.

### The hosted MCP question

OPS-15 proposed deploying `@primsh/mcp` as a hosted HTTP service at `mcp.prim.sh`. Agents would connect via URL instead of running a local process:

```json
// Hosted (proposed)
{ "prim": { "url": "https://mcp.prim.sh" } }

// Stdio (current)
{ "prim": { "command": "npx", "args": ["@primsh/mcp"] } }
```

The problem: a hosted MCP server needs to make x402-paid requests to prim endpoints on behalf of the agent. To sign those payments, it needs the agent's private key. Options considered:

| Option | Tradeoff |
|--------|----------|
| Agent passes private key via header | Defeats x402's trust model. Key leaves agent. |
| Server has its own funded wallet | Who pays? Doesn't scale. Breaks per-agent billing. |
| Internal key bypass (skip x402) | No payment, agents use for free. Same scaling problem. |
| Delegated authorization (EIP-7702, permit2) | Correct long-term, significant protocol work. |

## Decision

**Ship `@primsh/mcp` as an npm package with stdio transport.** `npx @primsh/mcp` is the onboarding path.

Rationale:

- **x402 works correctly with stdio.** Agent runs MCP server locally, has its own keystore, signs payments itself. No trust compromise.
- **The UX difference is minimal.** Both hosted and stdio require a config entry. `"command": "npx"` vs `"url": "https://..."` — same number of lines.
- **Beta audience (Claude Desktop, Cursor) supports stdio natively.** No demand for HTTP-only MCP from current users.
- **Hosted MCP is recoverable.** If web-based/sandboxed agents need it later, we can add delegated authorization without breaking the stdio path.

## Consequences

- `mcp.prim.sh` is not deployed. OPS-15 is deferred indefinitely.
- `@primsh/mcp` is published to npm. Agents install via `npx @primsh/mcp`.
- Agents must have Node.js (or Bun) installed. This is acceptable — MCP clients already require a runtime.
- Future: if delegated signing (agent pre-authorizes a spending allowance for a server wallet) becomes viable, revisit hosted MCP as a convenience layer.
