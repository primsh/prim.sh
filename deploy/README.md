# Deploy

## DNS Setup

### dl.prim.sh — R2 binary distribution

`dl.prim.sh` serves the `prim-releases` R2 bucket via a Cloudflare custom domain.

**Manual step required (Cloudflare dashboard):**

1. Create R2 bucket named `prim-releases` (or verify it exists)
2. In the bucket settings, add a custom domain: `dl.prim.sh`
3. Cloudflare will automatically provision a CNAME and TLS cert

The resulting DNS record is managed by Cloudflare automatically after the custom domain is set on the bucket. No manual CNAME entry is needed — Cloudflare handles it internally when you set the custom domain in R2 bucket settings.

**R2 API credentials required as GitHub Actions secrets:**

| Secret | Description |
|--------|-------------|
| `R2_RELEASES_ACCESS_KEY_ID` | R2 API token key ID (scope: `prim-releases` bucket, write) |
| `R2_RELEASES_SECRET_ACCESS_KEY` | R2 API token secret |
| `CF_ACCOUNT_ID` | Cloudflare account ID |

Create an R2 API token at: Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token (Object Read & Write, limit to `prim-releases` bucket).

### Directory structure

```
deploy/
├── prim/          # Core VPS services (wallet, store, spawn, faucet, search, domain, token, mem)
│   ├── Caddyfile  # Caddy reverse proxy config
│   ├── deploy.sh  # Deploy script (rsync + systemd reload)
│   ├── setup.sh   # First-time VPS setup
│   └── services/  # systemd unit files
└── email/         # Stalwart mail server
```
