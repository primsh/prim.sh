# Milestones

Extracted from TASKS.md on 2026-02-26. Project milestone retrospectives.

## token.sh complete — ERC-20 deploy + Uniswap V3 pool (2026-02-25)

**token.sh is feature-complete for agent-controlled token issuance and liquidity provisioning.**

What an agent can do today:
1. Deploy a named ERC-20 (custom decimals, optional mint cap) via x402 payment — `POST /v1/tokens`
2. Mint additional supply to any address — `POST /v1/tokens/:id/mint`
3. Create a Uniswap V3 pool paired with USDC at a chosen price — `POST /v1/tokens/:id/pool`
4. Get pre-computed `NonfungiblePositionManager.mint()` calldata to add full-range liquidity — `GET /v1/tokens/:id/pool/liquidity-params`

95 unit tests. Pool creation is idempotent (crash recovery: adopts existing on-chain pool if factory.getPool returns non-zero). Deployer key is custodied by token.sh; agent wallet is set as `Ownable` owner. Base + Base Sepolia supported.

**Known gap (TK-6):** on-chain `mint()` reverts because deployer key signs but `Ownable(owner_)` is the agent wallet. Not blocking — initial supply covers typical use.

## Non-custodial x402 end-to-end verified (2026-02-25)

**8/8 store.sh integration test steps pass on Base Sepolia.** Full non-custodial payment pipeline:
1. Agent generates private key locally
2. Registers wallet with wallet.sh via EIP-191 signature
3. Signs x402 payments client-side via `@primsh/x402-client`
4. store.sh accepts payments (facilitator settles on-chain), executes CRUD against real Cloudflare R2

Test wallet address and balance in `scripts/.env.testnet`. Cost: ~$0.07/run (6 store operations). Run: `set -a && source scripts/.env.testnet && set +a && bun run scripts/integration-test.ts`

## R-2 completion — domain + mail infrastructure (2026-02-25)

**Domain:** `prim.sh` registered via Namecheap ($34.98/yr). Project renamed from "AgentStack" to **Prim** ("primitive shell"). Each primitive is a subdomain: `relay.prim.sh`, `wallet.prim.sh`, `spawn.prim.sh`.

**Completed:**
- `prim.sh` Cloudflare zone (ID: `a16698041d45830e33b6f82b6f524e30`), NS pointed to `gene.ns.cloudflare.com` / `rudy.ns.cloudflare.com`
- 8 DNS records: A (prim.sh, relay.prim.sh, mail.relay.prim.sh), MX, SPF, DMARC, DKIM (RSA + Ed25519)
- Stalwart configured: hostname `mail.relay.prim.sh`, domain `relay.prim.sh`, DKIM dual signing, ACME Let's Encrypt (tls-alpn-01)
- API key created (`relay-wrapper` / Basic auth)
- docker-compose.yml deployed: port 8080 bound to 127.0.0.1
- UFW firewall: 22/25/443/465/587/993 open, 8080 denied
- Admin lockdown verified: 8080 unreachable from internet, works via SSH/localhost

**Verified (2026-02-25):**
- NS propagated to Cloudflare
- Let's Encrypt TLS cert issued (CN=mail.relay.prim.sh, expires 2026-05-26)
- SMTP STARTTLS on 587 working
- Admin port 8080 unreachable from internet
