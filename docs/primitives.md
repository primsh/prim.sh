# Primitives Reference

All primitives follow the same pattern: HTTP API, x402 payment, no signup. See [x402.md](./x402.md) for the payment flow.

Machine-readable endpoint reference: [prim.sh/llms.txt](https://prim.sh/llms.txt)

---

## Live (Base Sepolia testnet)

### wallet.sh — `wallet.prim.sh`

Agent wallet registration. EIP-191 signature proves ownership. Free.

```
POST /v1/wallets              Register a wallet address
GET  /v1/wallets/:address     Get wallet info
```

The wallet address is used to associate resources (buckets, servers) across all primitives.

---

### store.sh — `store.prim.sh`

Object storage backed by Cloudflare R2. S3-compatible.

```
POST   /v1/buckets                    Create bucket         $0.001
GET    /v1/buckets                    List your buckets     free
GET    /v1/buckets/:bucket            Get bucket info       free
DELETE /v1/buckets/:bucket            Delete bucket         $0.001

PUT    /v1/buckets/:bucket/*          Upload object         $0.001
GET    /v1/buckets/:bucket/*          Download object       $0.001
DELETE /v1/buckets/:bucket/*          Delete object         $0.001
GET    /v1/buckets/:bucket?list=true  List objects          free
```

Limits: 10 buckets/wallet, 100MB/bucket, 1GB total.

---

### spawn.sh — `spawn.prim.sh`

VPS provisioning via DigitalOcean. SSH key injected at creation.

```
POST   /v1/servers                    Create server         $0.01
GET    /v1/servers                    List your servers     free
GET    /v1/servers/:id                Get server info       free
POST   /v1/servers/:id/start          Start server          $0.005
POST   /v1/servers/:id/stop           Stop server           $0.005
POST   /v1/servers/:id/reboot         Reboot server         $0.005
DELETE /v1/servers/:id                Destroy server        $0.005

POST   /v1/ssh-keys                   Register SSH key      free
GET    /v1/ssh-keys                   List your SSH keys    free
DELETE /v1/ssh-keys/:id               Delete SSH key        free
```

Limits: 3 concurrent servers/wallet, `small` type only during beta.

---

### faucet.sh — `faucet.prim.sh`

Testnet USDC and ETH. Free, rate-limited.

```
POST /v1/faucet/usdc    Drip 1 USDC      rate limit: 1/2hr per wallet
POST /v1/faucet/eth     Drip 0.001 ETH   rate limit: 1/1hr per wallet
GET  /v1/faucet/status  Check rate limit status
```

---

### search.sh — `search.prim.sh`

Web search, news, and URL extraction via Tavily.

```
POST /v1/search        Web search          $0.005
POST /v1/search/news   News search         $0.005
POST /v1/search/extract  Extract from URL  $0.003
```

Request body for search:
```json
{
  "query": "your search query",
  "max_results": 5,
  "include_raw_content": false
}
```

---

## Built (not yet deployed)

These are implemented and tested but not live on the network yet.

| Primitive | What it does |
|-----------|-------------|
| email.sh | Send/receive email, webhooks (Stalwart JMAP) |
| domain.sh | DNS zone + record CRUD, domain registration (Cloudflare + NameSilo) |
| search.sh | Web search + extraction (Tavily) |
| token.sh | ERC-20 deploy + Uniswap V3 pool creation |
| mem.sh | Vector memory (Qdrant) + KV cache |

---

## Health checks

Every primitive has a free health endpoint:

```bash
curl https://wallet.prim.sh/
curl https://store.prim.sh/
curl https://spawn.prim.sh/
curl https://faucet.prim.sh/
curl https://search.prim.sh/
```

Returns `{"service": "<name>", "status": "ok"}`.

---

## Error format

All errors use a consistent envelope:

```json
{
  "error": {
    "code": "bucket_not_found",
    "message": "Bucket 'my-data' does not exist"
  }
}
```

Common codes: `wallet_not_registered`, `wallet_not_allowed`, `quota_exceeded`, `rate_limited`, `not_found`, `payment_required`.
