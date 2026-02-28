# Prim Marketing Funnel

## The Funnel

```
DISCOVER ──→ UNDERSTAND ──→ TRY ──→ BUILD ──→ SCALE
  │              │            │        │         │
  │              │            │        │         └─ Production use, real money
  │              │            │        └─ Integrate into their agent
  │              │            └─ First successful paid API call
  │              └─ "What is this? Why should I care?"
  └─ Agent or developer finds prim.sh
```

---

## Stage 1: DISCOVER

**Goal**: Agent or developer hears about Prim for the first time.

### Channels (ranked by expected impact for agent infra)

| Channel | Priority | Status | Notes |
|---------|----------|--------|-------|
| llms.txt / MCP / ai-plugin.json | P0 | **Done** | Primary agent discovery. 600+ sites now have llms.txt. This is how agents find us. |
| X (@useprim) | P0 | Not started | Composio proved scrappy demo videos > polished content. Build in public. |
| Hacker News (Show HN) | P0 | Not started | Fly.io's entire marketing is HN posts. Post the repo, not the landing page. |
| Product Hunt | P1 | Not started | Launch before HN. Good for general awareness. |
| Reddit (r/LocalLLaMA, r/programming) | P1 | Not started | 82% of devs use SO/Reddit regularly. |
| AI newsletters (TLDR AI, Latent Space) | P1 | Not started | High-trust, qualified audience. |
| Podcasts (Latent Space, Changelog) | P2 | Not started | E2B got distribution from Latent Space appearance. |
| dev.to / Hashnode | P2 | Not started | SEO long-tail. "Build X with Y" tutorials. |
| YouTube | P3 | Not started | Growing channel. Tutorials and demos. |
| GitHub Trending | P3 | Passive | Open-source repo may trend naturally after launch. |

### What we're doing
- Machine-readable discovery (llms.txt, sitemap, ai-plugin, mcp.json, discovery.json) — shipped
- SEO basics (robots.txt, og: tags, meta descriptions) — shipped

### What we're NOT doing
- Any social presence (@useprim is silent)
- Any content marketing
- Any outbound to AI agent builders
- Community (no Discord server yet)

### What we SHOULD be doing
- **Build in public on X**: Share architecture decisions, agent interaction logs, tradeoffs. Scrappy > polished. Start now, before launch.
- **Write 2-3 deep technical posts**: x402 payment protocol, "why agents need infrastructure", "building a 27-primitive stack". These become the HN launch material.
- **Set up Discord**: 3-5 channels max. Don't over-build. Start with #general, #support, #showcase, #feedback.
- **Draft the Show HN post**: Post the repo. No marketing speak. Modest language. Describe what it does and why.

### What we should NOT be doing
- Paid ads (waste of money at this stage for dev tools)
- Cold outreach / sales (developers hate it)
- Polished video production (scrappy wins)
- Press / PR (save for after HN traction)

### Blockers
- No social accounts active
- No launch content written
- No community platform set up

---

## Stage 2: UNDERSTAND

**Goal**: Developer grasps what Prim is, why it exists, and whether it solves their problem.

### Touchpoints

| Touchpoint | Status | Quality |
|------------|--------|---------|
| Homepage (prim.sh) | Live | Good — manifesto, principles, 27 prim cards |
| Per-prim landing pages | Live | Thin — brochure-level, missing quick_start/tips/limits |
| README.md | Live | Good |
| BRAND.md / voice | Internal | Strong — "Every service requires a human. This one doesn't." |
| Comparison pages ("Prim vs X") | Missing | — |
| FAQ | Missing | — |
| Changelog | Not served | CHANGELOG.md exists, not a web page |

### What we're doing
- Homepage communicates the vision clearly
- Per-prim pages exist with pricing and hero examples

### What we're NOT doing
- Rendering prim.yaml data that already exists (quick_start, tips, limits, ownership, interface badges)
- Comparison content (how is Prim different from Stripe, AWS, etc.?)
- FAQ for common questions
- Changelog as a web page (signals momentum)

### What we SHOULD be doing
- **Enrich prim landing pages**: Render quick_start, tips, limits, ownership, interface badges (REST/CLI/MCP). Data exists in prim.yaml — just not displayed.
- **Add category filters to homepage**: 27 cards is a wall. Let people filter by compute, storage, comms, etc.
- **Build a FAQ page**: "What's x402?", "Do I need a wallet?", "What network is this on?", "How do I pay?"
- **Serve the changelog**: Shows the project is alive and shipping.
- **Write one comparison page**: "Prim vs traditional cloud" — the "no signup, no GUI, no KYC" angle is genuinely novel.

### What we should NOT be doing
- Over-designing pages (the monospace dark-mode aesthetic is right — don't go glossy)
- Writing generic "thought leadership" content
- Building an elaborate docs site before the quickstart exists

### Blockers
- Prim pages have data but don't render it (template change needed)
- No docs infrastructure for FAQ/changelog/comparison pages

---

## Stage 3: TRY ← THE BROKEN STAGE

**Goal**: Developer goes from "this looks interesting" to "I made a successful API call."

This is where the funnel breaks. The research is clear: **if the quickstart takes more than 5 minutes, you lose most developers.** Composio reduced onboarding from 2 hours to 5 minutes and it contributed $100K+ in additional ARR.

### Current state

A developer lands on prim.sh, sees the primitives, gets excited, then... nothing. There's no guided path from "I'm interested" to "it worked."

The pieces exist individually:
- faucet.sh can dispense testnet USDC
- wallet.sh can create an agent wallet
- Every prim has an endpoint

But there's no connective tissue. No "run this and see it work" moment.

### The 60-second quickstart (what needs to exist)

```
# 1. Install the CLI (10 sec)
curl -fsSL https://prim.sh/install.sh | sh

# 2. Create a wallet + get free testnet USDC (15 sec)
prim wallet create
prim faucet drip

# 3. Make your first paid API call (5 sec)
prim search query "latest AI agent frameworks"

# 4. See the result ← THE MAGIC MOMENT
```

Four commands. Under 60 seconds. Zero signup. The agent (or developer) goes from nothing to a working paid API call.

### What we're doing
- CLI exists (`prim` binary)
- Faucet exists
- Wallet exists

### What we're NOT doing
- **No getting-started guide** (L-41 task exists but not started)
- **No guided quickstart on the site**
- **No "run this one command" hero example that actually works**
- **No interactive playground or cURL builder**
- **No video showing the 60-second flow**

### What we SHOULD be doing
- **Build the /docs getting-started guide** (L-41): This is the single highest-leverage marketing asset. Four commands to magic moment.
- **Put the quickstart on the homepage**: Not buried in docs. The first thing a developer sees should be "try this now."
- **Record a 60-second demo video**: Scrappy, terminal recording. Show the four commands working. Post on X, embed on homepage.
- **Fund initial users**: Pre-load faucet so first N users get free USDC automatically. This is the marketing budget — denominated in the payment currency itself.
- **Add a "Try it" button to every prim page**: Pre-filled cURL command that works against testnet.

### What we should NOT be doing
- Building an elaborate API playground before the basic quickstart works
- Requiring any signup or form before trying
- Gating the try experience behind access approval

### Blockers
- **No /docs page** — the guided quickstart has nowhere to live
- **Faucet credits model unclear** — how much does a new user get? Is it automatic?
- **CLI install script needs to work flawlessly** — one failure here kills the funnel

### Funded users strategy

Research shows the right model for pay-per-call APIs:

| Platform | Model | Amount |
|----------|-------|--------|
| Railway | 30-day $5 trial credit | Killed permanent free tier after losing $16/$1 revenue |
| Modal | $30/month auto-refreshing credits | Ongoing, covers exploration |
| Cloudflare Workers | $1.25B startup fund | Enterprise-scale funding program |
| Composio | "Composio for Startups" credits | Tiered by stage |
| x402 facilitator | 1,000 free tx/month | Built into the protocol |

**Recommendation for Prim**:
- **Tier 1 — Explore ($5 USDC)**: Auto-dripped on first `prim wallet create`. Enough for ~100 API calls. No application needed. This is the marketing budget line item.
- **Tier 2 — Build ($50 USDC)**: For developers with a project. Simple form: "what are you building?" One-line answer, auto-approved.
- **Tier 3 — Launch ($500 USDC)**: For agents going to production. Brief review. "Prim for Startups" program.

The key insight: **denominate credits in USDC, the actual payment currency.** This is more natural than abstract "credits" and reinforces the x402 model.

---

## Stage 4: BUILD

**Goal**: Developer integrates Prim into their agent for a real use case.

### Touchpoints

| Touchpoint | Status | Notes |
|------------|--------|-------|
| SDK (@primsh/sdk) | Exists | TypeScript SDK, 11 clients |
| MCP server (@primsh/mcp) | Exists | 9 primitives wired |
| CLI (prim) | Exists | Full command coverage |
| OpenAPI specs | Exists | Per-prim YAML specs |
| Per-prim docs | Missing | No integration guides beyond landing page |
| Example agents | Missing | No "build an agent that does X" templates |
| Cookbooks / recipes | Missing | No multi-prim workflow examples |

### What we're doing
- SDK, MCP, CLI, and OpenAPI specs all exist
- llms.txt and llms-full.txt describe each prim for agent consumption

### What we're NOT doing
- **No integration guides**: "How to use spawn.sh + store.sh together to deploy a stateful service"
- **No example agents**: A reference agent that uses 3-4 prims to accomplish a real task
- **No cookbooks**: Multi-prim workflows (e.g., "create a VM, deploy code, set up email, register domain")

### What we SHOULD be doing
- **Write 3-5 cookbook recipes**: Multi-prim workflows that show composability. These double as marketing content ("Build X with Prim" blog posts).
- **Build 1 reference agent**: An agent that uses wallet + faucet + spawn + store to accomplish something real. Open-source it. This is the strongest possible demo.
- **Add "Related prims" to landing pages**: spawn.sh page suggests wallet.sh, store.sh, domain.sh. Cross-sell within the stack.

### What we should NOT be doing
- Building an elaborate docs site before cookbook content exists
- Creating video courses (too early, content will change)
- Writing docs for phantom prims

### Blockers
- No docs infrastructure for guides/cookbooks
- No reference agent exists

---

## Stage 5: SCALE

**Goal**: Agent runs in production, developer pays real money, trusts the platform.

### Touchpoints

| Touchpoint | Status | Notes |
|------------|--------|-------|
| Pricing page | Exists | pricing.json served, per-prim pricing on landing pages |
| Status page | Missing | No uptime monitoring visible to users |
| SLAs | Missing | No reliability commitments |
| Cost calculator | Missing | No way to estimate spend |
| Mainnet | Not yet | Still on Base Sepolia (testnet) |
| Support channel | Missing | No way to get help |

### What we're doing
- Transparent per-call pricing on every prim page
- pricing.json machine-readable

### What we're NOT doing
- Status page (uptime, incidents)
- Cost calculator
- Production readiness signals (SLAs, support)
- Mainnet (L-22 task exists)

### What we SHOULD be doing
- **Ship mainnet** (L-22): Can't scale on testnet. This is the real blocker.
- **Add a status page**: Even a simple one (status.prim.sh). Uptime badges on prim pages.
- **Cost calculator**: Input expected call volumes, see projected monthly cost. Builds trust.
- **Discord #support channel**: Humans need a way to get help when their agent breaks.

### What we should NOT be doing
- Writing SLAs before we have uptime data
- Building enterprise features before we have 10 paying users
- Complex billing dashboards

### Blockers
- **Mainnet switchover** is the hard gate. Everything else is polish until agents can pay with real USDC.

---

## Launch Playbook

Based on research across Stripe, Supabase, Fly.io, E2B, Firecrawl, Composio, and Railway:

### Pre-launch (now → launch week)

1. **Build in public on X** — Start posting now. Architecture decisions, tradeoffs, agent demos. Scrappy > polished. Composio's CEO proved this.
2. **Write the quickstart** — The /docs getting-started guide. Four commands to magic moment.
3. **Write 2-3 deep technical posts** — "Why agents need their own infrastructure", "x402: how agents pay for APIs", "Building 27 primitives with zero signup". These become launch material and HN fodder.
4. **Set up Discord** — #general, #support, #showcase, #feedback, #announcements. Don't over-build.
5. **Fund the faucet** — Pre-load with marketing budget USDC. First 1,000 users get $5 free.
6. **Build 1 reference agent** — Open-source. Uses 3-4 prims. This is the hero demo.
7. **Record the 60-second demo** — Terminal recording. Four commands. Post everywhere.

### Launch week (Supabase model)

Ship one thing per day for five days. Each day gets a blog post, X thread, and Discord announcement.

| Day | Ship | Angle |
|-----|------|-------|
| Mon | Quickstart + docs | "Zero to paid API call in 60 seconds" |
| Tue | Reference agent | "An agent that deploys itself" (or similar) |
| Wed | MCP + SDK | "Add 27 primitives to Claude/GPT in one line" |
| Thu | Funded accounts ($5 USDC free) | "We're paying for your first 100 API calls" |
| Fri | Show HN | Post the repo. Let HN do its thing. |

### Post-launch

- **Product Hunt** the Monday after HN (if HN goes well, PH will follow)
- **Newsletter submissions** — TLDR AI, Latent Space, etc.
- **Podcast outreach** — Latent Space, Changelog, AI-focused shows
- **"Build X with Prim" content series** — One per week. Each showcases a multi-prim workflow.
- **Community nurturing** — Weekly show-and-tell in Discord. Feature community builds on X.

---

## Priority Stack (what to do next)

Ordered by funnel impact:

| # | Item | Stage | Effort | Impact |
|---|------|-------|--------|--------|
| 1 | /docs quickstart guide | Try | Medium | **Critical** — the funnel is broken without this |
| 2 | Fund faucet + define credit tiers | Try | Low | Removes friction from first use |
| 3 | X presence (@useprim) | Discover | Low | Start now, compound over time |
| 4 | Enrich prim landing pages (badges, tips, limits) | Understand | Low | Data exists, just needs rendering |
| 5 | 60-second demo video | Try/Discover | Low | Reusable across all channels |
| 6 | 2-3 technical blog posts | Discover | Medium | HN launch material |
| 7 | Discord server | Discover/Scale | Low | Community home base |
| 8 | Reference agent | Build | Medium | Strongest possible demo |
| 9 | Homepage category filters | Understand | Low | UX improvement |
| 10 | Changelog page | Understand | Low | Signals momentum |
| 11 | Status page | Scale | Medium | Production confidence |
| 12 | Cost calculator | Scale | Medium | Reduces pricing anxiety |
| 13 | Show HN + launch week | Discover | High | The big moment |
