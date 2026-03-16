# Primitive Catalog

> Canonical list of every primitive prim should support. No primitive gets built without being on this list.

Last updated: 2026-03-15

---

## Tier Definitions

- **T1** — Build next. Clear agent demand, viable provider, fast to ship.
- **T2** — Build eventually. High value, more complex integration.
- **T3** — Speculative. Build if demand materializes.
- **Live** — Deployed and operational.
- **Hold** — Package exists, not yet deployed.
- **Cut** — Removed from roadmap with rationale.

---

## Live

| # | Prim | Category | What it does | Provider | Notes |
|---|------|----------|-------------|----------|-------|
| 1 | wallet.sh | Crypto | Agent wallets, USDC on Base, x402 payment | Custom (viem) | Foundation for everything |
| 2 | store.sh | Storage | Object storage, S3-compatible | Cloudflare R2 | |
| 3 | search.sh | Intelligence | Web search, news, URL extraction | Tavily | |
| 4 | gate.sh | Access | Invite codes, allowlisting | Custom | |
| 5 | faucet.sh | Testnet | Free testnet USDC + ETH drip | Coinbase CDP | |
| 6 | feedback.sh | Meta | Bug reports, feature requests | Custom (SQLite) | |

## Hold (built, not deployed)

| # | Prim | Category | What it does | Provider | Notes |
|---|------|----------|-------------|----------|-------|
| 7 | email.sh | Communication | Mailboxes, send/receive, webhooks | Stalwart JMAP | Needs Stalwart on VPS |
| 8 | spawn.sh | Compute | VPS provisioning | Hetzner | |
| 9 | infer.sh | Intelligence | LLM inference, any model | OpenRouter | |
| 10 | token.sh | Crypto | ERC-20 deploy + Uniswap pools | Custom (viem) | |
| 11 | mem.sh | Intelligence | Vector store + KV cache | Qdrant | |
| 12 | domain.sh | Infrastructure | Domain registration + DNS | Cloudflare + NameSilo | Absorbed dns.sh |
| 13 | track.sh | Logistics | Package tracking | Shippo | |
| 14 | create.sh | Meta | Prim scaffolder + validator | Internal | |
| 15 | imagine.sh | Media | Image generation | Replicate | |

## T1 — Build next

High agent demand, clear provider, fast to ship.

| # | Prim | Category | What it does | Provider (cheapest, most API-native) | Justification |
|---|------|----------|-------------|--------------------------------------|---------------|
| 16 | ring.sh | Communication | Phone numbers, SMS, voice, TTS | Twilio ($0.0079/SMS) | Agents need human-reachable comms beyond email. Every agent framework lists "can't send SMS" as a gap. |
| 17 | sign.sh | Legal | Digital document signing (e-signatures) | Dropbox Sign (free: 3 docs/mo) | Contracts, NDAs, agreements are constant blockers for autonomous agents. |
| 18 | cal.sh | Productivity | Calendar management, scheduling | Cal.com (free, open source, API-first) | Scheduling is the #1 human coordination task. Every agent that interacts with humans needs this. |
| 19 | db.sh | Infrastructure | Managed databases (SQL, KV) | Turso (free: 500 DBs, 9GB) | Agents building apps need structured persistence. store.sh handles blobs, not relational data. |
| 20 | ocr.sh | Intelligence | Extract text from images and PDFs | Google Document AI (free: 1K pages/mo) | Unlocks all document processing workflows. Receipts, contracts, invoices, IDs. |
| 21 | code.sh | Compute | Sandboxed code execution | E2B (free: 100 sandbox hours) | Foundational for coding agents — safe execution without persistent VMs. |
| 22 | scrape.sh | Intelligence | Structured web scraping + extraction | Firecrawl (free: 500 credits) | Distinct from search.sh (returns snippets) and browse.sh (full browser). Scrape.sh returns structured data from URLs. |
| 23 | print.sh | Physical | Print and mail physical documents | Lob (free: 300 mailings) | Physical mail is irreplaceable — invoices, legal notices, government correspondence. No digital alternative. |
| 24 | mkt.sh | Data | Market data — quotes, options, fundamentals, macro | Custom (wraps FRED, FMP, CoinGecko, EDGAR) | Pattern 2 prim — wraps existing mktdata library. 30+ data sources unified. |
| 25 | cap.sh | Intelligence | Web page capture — screenshot, DOM, network, perf | Custom (wraps sitecap via Playwright) | Pattern 2 prim — wraps existing sitecap tool. Full page capture for agent analysis. |

## T2 — Build eventually

High value, more complex integration or narrower demand.

| # | Prim | Category | What it does | Provider | Justification |
|---|------|----------|-------------|----------|---------------|
| 26 | vault.sh | Security | Secrets and credential management | Infisical (free, open source) | Agents accumulate API keys across services. Secure storage with rotation. |
| 27 | pipe.sh | Infrastructure | Pub/sub, webhooks, event queues | Upstash QStash (free: 500 msgs/day) | Async workflow orchestration backbone. Absorbs queue.sh concept. |
| 28 | cron.sh | Compute | Scheduled code execution | Upstash QStash | Timed triggers for recurring agent tasks. |
| 29 | browse.sh | Intelligence | Headless browser sessions | Custom (Playwright) | Full browser automation — distinct from scrape.sh (data) and cap.sh (capture). |
| 30 | pay.sh | Finance | Stripe + x402 fiat bridge | Stripe | Fiat on/off ramp for agent commerce. |
| 31 | invoice.sh | Finance | Invoice generation + collection | Stripe Invoicing (0.4%) | Agents running businesses need to bill clients. |
| 32 | watch.sh | Operations | Logs, metrics, alerts | BetterStack (free: 1GB/mo) | Centralized observability. Absorbs trace.sh. |
| 33 | auth.sh | Identity | OAuth broker | WorkOS (free: 1M MAU) | Agents building SaaS need auth without implementing OAuth. |
| 34 | id.sh | Identity | Identity verification, KYC | Persona (pay-per-verification) | Agents onboarding users for regulated services. |
| 35 | ship.sh | Logistics | Shipping labels + tracking | Shippo (free tier) | Physical commerce requires shipping. |
| 36 | pins.sh | Physical | Geocoding, places, routing | Radar (free: 100K calls/mo) | Agents coordinating physical-world activities. |
| 37 | deploy.sh | DevOps | Push-to-deploy (code → live endpoint) | Railway or Fly.io | Code to live service without server config. |
| 38 | tts.sh | Intelligence | Text-to-speech synthesis | ElevenLabs (free: 10K chars/mo) | Voice is the next frontier for agent interaction. |
| 39 | stt.sh | Intelligence | Speech-to-text transcription | Deepgram (free: $200 credit) | Process meetings, calls, voicemails, podcasts. |
| 40 | grade.sh | Intelligence | Website audit — SEO, security, performance | Custom (wraps sitegrade) | Pattern 2 prim — wraps existing sitegrade tool. |
| 41 | test.sh | DevOps | Behavior test execution for web UIs | Custom (wraps sitetest) | Pattern 2 prim — wraps existing sitetest tool. |
| 42 | seek.sh | Intelligence | Deep research agent | Custom | Multi-step research with source synthesis. |
| 43 | vpn.sh | Infrastructure | Network tunnels + proxies | Custom | Agents needing network isolation or geo-routing. |
| 44 | cert.sh | Infrastructure | TLS certificate provisioning | ZeroSSL (free: 3 certs) or ACME | Agents spawning servers or managing domains need TLS. |
| 45 | know.sh | Intelligence | Knowledge base — ingest, classify, graph query | Custom (wraps engram) | Pattern 2/3 prim — structured knowledge management beyond vector search (mem.sh). |
| 46 | embed.sh | Intelligence | Embedding generation | Voyage AI (free: 50M tokens) | Could live in infer.sh, but dedicated endpoint is cleaner for high-volume embedding workloads. |
| 47 | form.sh | Productivity | Create forms, collect responses | Tally (free, API) | Agents collecting structured input from humans. |
| 48 | post.sh | Social | Cross-platform social media posting | Buffer (free: 3 channels) | Agents managing brand presence. |

## T3 — Speculative

Build if demand materializes. No current urgency.

| # | Prim | Category | What it does | Provider | Justification |
|---|------|----------|-------------|----------|---------------|
| 49 | gpu.sh | Compute | GPU instances on demand | Lambda / RunPod | ML inference, fine-tuning. Narrow audience. |
| 50 | fn.sh | Compute | Serverless functions | Cloudflare Workers | Lightweight compute. Overlaps with code.sh + deploy.sh. |
| 51 | graph.sh | Data | Knowledge graph store | Neo4j | Entity-relationship queries. Narrow use case. |
| 52 | feed.sh | Data | RSS/Atom/JSON Feed ingestion | Miniflux | Content monitoring. Agents can scrape directly. |
| 53 | chat.sh | Communication | Managed chat channels | Ably (free: 6M msgs/mo) | Agent-to-agent messaging. Demand unclear. |
| 54 | render.sh | Media | HTML/PDF rendering | WeasyPrint / Puppeteer | Report generation. Could be a feature of cap.sh. |
| 55 | stream.sh | Media | Audio/video streaming | Mux (free tier) | Real-time media. Narrow use case. |
| 56 | ci.sh | DevOps | CI/CD pipeline execution | GitHub Actions API (free: 2K mins) | Agents deploying code. Overlaps with deploy.sh. |
| 57 | git.sh | DevOps | Git hosting + API | Gitea (self-hosted) | Agents managing repos without GitHub. Niche. |
| 58 | escrow.sh | Finance | Escrow + dispute resolution | Custom (smart contract) | Multi-party agent transactions. Needs demand signal. |
| 59 | bank.sh | Finance | Banking API (ACH, wires) | Increase / Column | Real banking for agent businesses. Heavily regulated. |
| 60 | scan.sh | Security | Vulnerability scanning | Trivy (free, open source) | Security scanning. Agents can run tools directly. |
| 61 | sensor.sh | Physical | IoT sensor data | AWS IoT / ThingsBoard | Real-world state. Extremely niche. |
| 62 | translate.sh | Intelligence | Translation API | DeepL / LibreTranslate | Multi-language. infer.sh can do this already. |
| 63 | seed.sh | DevOps | Data seeding for web apps | Custom (wraps siteseed) | Pattern 2 prim. Narrow audience. |
| 64 | sitmon.sh | Data | Global event intelligence | Custom (wraps sitmon) | Geopolitical/weather/cyber signals. Pattern 3 prim. |
| 65 | grok.sh | Intelligence | Real-time X/web research | xAI Grok | Pattern 2 prim. Overlaps with search.sh + seek.sh. |
| 66 | notify.sh | Communication | Push notifications | OneSignal (free: unlimited) | Could be a feature of ring.sh. |
| 67 | fax.sh | Communication | Fax sending | Phaxio ($0.07/page) | Legal/medical niche. Real demand but tiny. |

## Cut

Removed from roadmap with rationale.

| Prim | Reason |
|------|--------|
| dns.sh | Absorbed by domain.sh — DNS is a feature of domain management, not a separate primitive. |
| trace.sh | Absorbed by watch.sh — distributed tracing is a feature of observability, not a separate service. |
| hive.sh | Speculative — agent social graph / peer discovery has no demand signal. No clear use case beyond "agents talking to agents" which pipe.sh handles. |
| ads.sh | Speculative — programmatic ads for agents lacks both buyer and audience. Who pays? Who sees the ad? |
| corp.sh | Too regulated, too broad — legal entity creation spans 50 US states + international jurisdictions. High liability, low API availability. Better served by specialized services (Stripe Atlas, Clerky). |
| hands.sh | Company unto itself — human labor marketplace is a full business (TaskRabbit, Upwork), not a primitive. Requires dispute resolution, payment escrow, quality assurance, insurance. |
| docs.sh | Dev tool, not agent primitive — OpenAPI → MCP conversion is a build-time tool, not a runtime service. Already handled by prim's gen pipeline. |
| mart.sh | Too broad — "buy physical goods" spans every product category. No single provider wraps this. Agents can use existing e-commerce APIs directly. |

---

## Category Summary

| Category | Count | Prims |
|----------|-------|-------|
| Infrastructure | 7 | store, domain, db, pipe, cron, vault, cert |
| Compute | 5 | spawn, code, deploy, gpu, vpn |
| Intelligence | 11 | search, infer, mem, imagine, ocr, scrape, seek, embed, cap, grade, know |
| Communication | 4 | email, ring, chat, notify |
| Finance | 4 | wallet, token, pay, invoice |
| Identity | 3 | gate, auth, id |
| Physical | 4 | track, ship, pins, print |
| Operations | 1 | watch |
| Productivity | 2 | cal, form |
| Social | 1 | post |
| Media | 2 | render, stream |
| DevOps | 4 | create, test, ci, git |
| Data | 3 | mkt, feed, sitmon |
| Legal | 1 | sign |
| Security | 1 | scan |
| Testnet | 1 | faucet |
| Meta | 1 | feedback |
| **Total** | **67** | |

---

## Overlap Analysis

These prims have potential overlap — kept separate with distinct scope:

| Pair | Distinction |
|------|------------|
| search.sh vs scrape.sh | search returns snippets from a query; scrape returns structured data from a specific URL |
| search.sh vs seek.sh | search is a single query; seek is multi-step research with synthesis |
| scrape.sh vs cap.sh | scrape extracts structured data; cap captures the full page (screenshot, DOM, network, perf) |
| scrape.sh vs browse.sh | scrape is stateless extraction; browse is a full interactive browser session |
| mem.sh vs know.sh | mem is vector similarity + KV cache; know is structured knowledge with classification and graph |
| mem.sh vs embed.sh | mem stores and queries vectors; embed only generates vectors (no storage) |
| code.sh vs deploy.sh | code is ephemeral execution (run and discard); deploy is persistent (run and keep serving) |
| code.sh vs spawn.sh | code is sandboxed, seconds-lived; spawn is a full VM, hours/days-lived |
| watch.sh vs trace.sh | merged — trace is a feature of watch |
| ring.sh vs notify.sh | ring is full telephony (SMS, voice, numbers); notify is lightweight push only |
| infer.sh vs tts.sh/stt.sh | infer is text LLMs; tts/stt are specialized audio models with different providers |
| pipe.sh vs cron.sh | pipe is event-driven (on trigger); cron is time-driven (on schedule). Could merge. |

---

## Provider Selection Criteria

For each primitive, the provider is chosen by:

1. **API-native** — REST API as primary interface, not a dashboard with an API bolted on
2. **Free tier** — Enables bootstrapping without upfront cost. Critical for DeKeys pooling.
3. **Cheapest at scale** — Per-request cost must allow $0.001 floor pricing
4. **No human signup required** — Provider account can be provisioned programmatically (or prim manages one account)
5. **Reliability** — Uptime SLA, rate limits sufficient for production use
