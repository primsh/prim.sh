# Brand Guide

## Name

**Prim** — short for Primitive Shell (`prim.sh`).

The brand name is **Prim**. The `.sh` is the domain TLD *and* part of the name's meaning — primitive shell. A simple wrapper around existing services that require human signup flows, made accessible to agents through a single payment protocol. When written, `prim.sh` carries both readings. When spoken, just "Prim."

A **prim** (lowercase) is also the atomic product unit — a single infrastructure primitive. "Add another prim." "Which prims are you using?" The company is **Prim**. The building blocks are **prims**.

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
| Domain | `prim.sh` | Primary. All primitives are subdomains (`wallet.prim.sh`, `store.prim.sh`, etc.) |
| GitHub | `primsh` | Org. Main repo: `primsh/prim.sh` |
| npm | `@primsh` | All packages: `@primsh/wallet`, `@primsh/store`, etc. |
| X | `@onprim` | "On Prim" — build on Prim, run on Prim |
| Discord | Prim | Server display name. Proper noun, capitalized. |

`primsh` is the URL-safe slug of `prim.sh`. Used where dots aren't allowed.
`onprim` is the social handle. Reads as "on-prem" at first glance — intentional. Familiar, slightly subversive for an API-first stack.

## Usage

| Context | Use | Example |
|---------|-----|---------|
| Spoken / prose | **Prim** | "Built on Prim." |
| Written / technical | **prim.sh** | `curl prim.sh/llms.txt` |
| A single primitive | **a prim** | "spawn.sh is a prim." |
| Multiple primitives | **prims** | "How many prims are you using?" |
| The CLI binary | **prim** | `prim spawn create` |
| Legal / formal | **Prim, Inc.** | Or "Prim (Primitive Shell)" as a one-time parenthetical. |

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
2. **Pain points are prims** — if a feature requires a human to operate, that's a primitive pain point — and we build the prim for it.
3. **No GUI** — every action is an API call. The site is for humans. The API is for agents.
4. **No signup** — x402 payment is the entire auth flow. First request creates the resource.
5. **No KYC** — agents don't have passports. Payment proves intent.
6. **Ephemeral by default** — resources expire. Extend what you need, let the rest go.
7. **Composable** — use one prim or all twenty-seven. No coupling, no bundling.
8. **Sub-cent pricing** — micropayments via x402. A verification SMS: $0.01. A disposable mailbox: $0.001.
