# Brand Guide

## Hierarchy

**Primitive Shell** is the parent organization. **Prim** is the first product.

| Entity | What it is | Where it appears |
|--------|-----------|-----------------|
| **Primitive Shell** | Parent org/company | Legal, copyright, GitHub org display name, about pages |
| **Prim** | Product brand | Site, README, docs, CLI, everything user-facing |

Primitive Shell owns the vision (agent-native infrastructure). Prim is the product that delivers it. If a second product ever ships, it lives under Primitive Shell alongside Prim.

Legal entity: **Prim.sh LLC** (or Primitive Shell LLC — TBD).

## Name

**Prim** — short for Primitive Shell (`prim.sh`).

The brand name is **Prim**. The `.sh` is the domain TLD *and* part of the name's meaning — primitive shell. A simple wrapper around existing services that require human signup flows, made accessible to agents through a single payment protocol. When written, `prim.sh` carries both readings. When spoken, just "Prim."

A **prim** (lowercase) is also the atomic product unit — a single infrastructure primitive. "Add another prim." "Which prims are you using?" The product is **Prim**. The building blocks are **prims**.

## Tagline
*What we are. Goes next to the logo.*

**The agent-native stack.**

## One-liner
*What we offer. The elevator pitch.*

Infinite primitives. Zero signup. One payment token.

## Closer
*The last thing they read. The emotional hook.*

**Every service requires a human. This one doesn't.**

Alternates:
- "Infrastructure was built for humans. This stack wasn't."
- "The cloud was built for humans. This one's built for agents."

## Voice

Direct. Technical. No filler.

The customer is the agent, not the human. The site is for humans — the API is for agents. Write like infrastructure documentation that happens to have a point of view.

- "Agents need infrastructure. Not dashboards, not consoles, not onboarding wizards — infrastructure as API calls."
- "The entire cloud is gated by human identity. Prim removes the gate."
- "Every service requires a human. This one doesn't."

No exclamation marks. No "we're excited." No "getting started is easy." State what it does. Let the reader decide if it's exciting.

## Handles

| Platform | Handle | Notes |
|----------|--------|-------|
| Domain (product) | `prim.sh` | All primitives are subdomains (`wallet.prim.sh`, `store.prim.sh`, etc.) |
| Domain (org) | `primitiveshell.com` | Parent org. Redirects to `prim.sh` or hosts a minimal about page. |
| Domain (org, reserved) | `primitiveshell.org` | Reserved for potential future foundation use. |
| GitHub org | `primsh` | Slug. Display name set to **Primitive Shell**. Main repo: `primsh/prim` |
| npm | `@primsh` | All packages: `@primsh/wallet`, `@primsh/store`, etc. |
| X | `@useprim` | Handle. Display name: **Prim** (not "Prim.sh" or "Primitive Shell") |
| Discord | Prim | Server display name. Proper noun, capitalized. |

`primsh` is the URL-safe slug of `prim.sh`. Used where dots aren't allowed.
`useprim` is the social handle. Direct and imperative — matches the brand voice.

## Usage

| Context | Use | Example |
|---------|-----|---------|
| Spoken / prose | **Prim** | "Built on Prim." |
| Written / technical | **prim.sh** | `curl prim.sh/llms.txt` |
| A single primitive | **a prim** | "spawn.sh is a prim." |
| Multiple primitives | **prims** | "How many prims are you using?" |
| The CLI binary | **prim** | `prim spawn create` |
| Legal / copyright | **© Primitive Shell** | Footer, LICENSE. The org name, not the product. |
| Legal / formal | **Prim.sh LLC** | Or Primitive Shell LLC — TBD. |

## Visual Identity

**Style: spray paint neo candy.** Neon colors on black. Drips, splatter, glow. Analog texture meets digital infrastructure. Street-level energy against serious-infra positioning.

**Core mark: `>`** — the shell prompt chevron. Spray-painted on black. This is the base logo. It's universal (shell prompt, forward, greater-than) and becomes Prim's through the spray paint treatment.

The chevron is modular — it pairs with different suffixes for different contexts:
- `>|` — primary logo. Shell prompt + bar cursor. The bar is the agent, ready to act. Also reads as a pipe.
- `>_` — typing/input variant. Shell prompt + underscore cursor.
- `>` — standalone. Favicon, small contexts, anywhere the suffix gets lost.

Colors:
- `>` chevron: green (`#00ff88`) — the primary brand color
- `|` bar: cyan (`#4DD0E1`) — secondary, provides contrast
- Surrounding splatter: flecks of the other prim accent colors (purple, pink, orange, gold, coral) — the ecosystem in overspray

Usage:
- **Avatar** (GitHub, X, Discord): `>|` spray paint, square crop
- **Banner** (X header, README): stacked neon stripes — one color per prim, spray-painted. Reads as "the stack."
- **Favicon**: `>` chevron, green on black

No clean vector logos. No gradients. No illustrations. The spray paint *is* the aesthetic — raw, fast, built in the open.

## Design

Dark-mode. Monospace.

- Background: `#0a0a0a`
- Surface: `#111`
- Text: `#e0e0e0`
- Muted: `#666`
- Font: `SF Mono, SFMono-Regular, Cascadia Code, Consolas, monospace`
- Each prim has a unique accent color (green for spawn, blue for email, red for ring, etc.)

## Principles

1. **Built for agents** — the agent is the customer, not the developer. No human in the loop at runtime.
2. **Pain points are primitives** — if a feature requires a human to operate, that's a primitive pain point — and we build the prim for it.
3. **No GUI** — every action is an API call. The site is for humans. The API is for agents.
4. **No signup** — x402 payment is the entire auth flow. First request creates the resource.
5. **Pay, don't prove** — agents don't have passports. Payment proves intent.
6. **No lock-in** — use what you need, leave when you're done. No contracts, no minimums.
7. **Composable** — use one prim or all twenty-seven. No coupling, no bundling.
8. **Pay per call** — micropayments via x402. Every request is priced individually. No subscriptions, no metering.
