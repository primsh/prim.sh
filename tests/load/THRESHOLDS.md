# prim.sh Load Test — Capacity Thresholds

Baseline thresholds derived from single-node VPS characteristics (<your-vps-ip>,
Ubuntu 24.04, shared DigitalOcean droplet). All primitives run as Bun/Hono processes
behind Caddy reverse proxy.

---

## Hardware Baseline

| Resource | Spec | Notes |
|----------|------|-------|
| CPU      | 1 vCPU | Shared, burstable |
| RAM      | 1 GB | All primitives share this pool |
| Network  | 1 Gbps | DigitalOcean shared |
| Disk     | SSD | SQLite writes are fast; R2 is remote |

---

## Per-Endpoint Thresholds

### Health endpoints (`GET /`)

All health endpoints are Bun in-process handlers — no upstream I/O.

| Metric | Target | Hard Limit |
|--------|--------|-----------|
| p50 latency | < 30ms | — |
| p95 latency | < 300ms | 500ms |
| p99 latency | < 500ms | 1000ms |
| Error rate | 0% | < 0.1% |
| Throughput | 50 req/s per service | 200 req/s total across all services |

### store.sh 402 challenge (`POST /v1/buckets` etc.)

x402 middleware generates an EIP-712 payment challenge. No upstream I/O for the
initial 402 response (the wallet allowlist check hits wallet.sh via internal HTTP,
which is localhost).

| Metric | Target | Hard Limit |
|--------|--------|-----------|
| p50 latency | < 50ms | — |
| p95 latency | < 300ms | 500ms |
| p99 latency | < 800ms | 2000ms |
| 402 rate | > 99% of unauthenticated requests | 100% |
| 5xx error rate | 0% | < 0.1% |
| Throughput | 30 req/s (10 VUs @ 300ms avg) | — |

### store.sh paid operations (post-payment)

After payment verification, store endpoints call Cloudflare R2. R2 p99 latency
(Frankfurt → R2 auto region) is typically 80–200ms.

| Operation | p95 target | Notes |
|-----------|-----------|-------|
| `POST /v1/buckets` | < 500ms | R2 bucket creation |
| `PUT /v1/buckets/:id/objects/*` | < 1000ms | Upload; depends on object size |
| `GET /v1/buckets/:id/objects/*` | < 500ms | Download; depends on object size |
| `DELETE /v1/buckets/:id/objects/*` | < 500ms | R2 delete |
| `GET /v1/buckets` | < 300ms | SQLite read |
| `GET /v1/buckets/:id/quota` | < 200ms | SQLite read |

---

## Concurrency Limits

Based on single-vCPU Bun process:

| Scenario | Safe | Maximum before degradation |
|----------|------|-----------------------------|
| Health sweeps (all services) | 20 VUs total | ~50 VUs (p95 starts drifting above 300ms) |
| store.sh 402 challenge only | 30 VUs | ~80 VUs (allowlist DB contention) |
| store.sh paid ops (R2) | 10 VUs | ~20 VUs (R2 upstream becomes bottleneck) |
| Mixed realistic agent traffic | 10–15 VUs | ~40 VUs |

**Note**: These are estimates for the current single-node deploy. Horizontal scaling
(multiple VPS nodes behind a load balancer) is the correct scaling path, not tuning
Bun concurrency.

---

## Soak Test Pass Criteria

For overnight / extended runs (1–8 hours):

- p95 must not drift more than +50ms between the first 5 minutes and the last 5 minutes
- No p99 spike above 2000ms
- Memory on the VPS must not grow monotonically (restart services if RSS > 512MB)
- Error rate must stay < 0.1% over the full run

---

## Runbook: When Thresholds Are Breached

### p95 > 500ms on health endpoints

1. SSH to VPS: `root@<your-vps-ip>`
2. Check systemd status: `systemctl status prim-wallet prim-store prim-faucet`
3. Check Bun RSS: `ps aux | grep 'bun run'`
4. If RSS > 512MB on any service: `systemctl restart prim-<service>`
5. Check Caddy: `systemctl status caddy` — Caddy TLS overhead adds ~5ms; check for cert renewal storms

### 5xx errors on paid endpoints

1. Check application logs: `journalctl -u prim-store -n 100 --no-pager`
2. Common causes:
   - R2 credentials expired → rotate in `/etc/prim/store.env`, restart service
   - wallet.sh allowlist check timeout → check `systemctl status prim-wallet`
   - SQLite lock contention → check for stuck transactions with `lsof | grep .db`

### 402 rate drops below 99%

This means some paid requests are returning 200 without payment — indicates the
x402 middleware is misconfigured or the `freeRoutes` list was accidentally widened.
Treat as a **P0 incident**. Audit `packages/*/src/index.ts` for `freeRoutes` changes.

---

## Running the Tests

### Prerequisites

```bash
# Install k6 (macOS)
brew install k6

# Install k6 (Linux)
sudo apt-get install k6

# Verify
k6 version
```

### Run health sweep (2m 45s total)

```bash
k6 run tests/load/health.js
```

### Run store CRUD (3m 15s total)

```bash
k6 run tests/load/store-crud.js

# Against localhost (bypasses Caddy):
k6 run --env STORE_URL=http://localhost:3002 tests/load/store-crud.js
```

### Run soak (1h default, shorten for quick validation)

```bash
# Quick 10-minute validation
k6 run --env DURATION=10m tests/load/soak.js

# Full overnight soak
k6 run tests/load/soak.js
```

### Save results to JSON for comparison

```bash
k6 run --out json=tests/load/results/health-$(date +%Y%m%d-%H%M%S).json tests/load/health.js
```

---

## Baseline Results (to be filled in after first run)

Run `k6 run tests/load/health.js` against the deployed VPS and record results here.

| Date | Test | p50 | p95 | p99 | Errors | Req/s | VUs | Pass? |
|------|------|-----|-----|-----|--------|-------|-----|-------|
| — | health.js | — | — | — | — | — | 10 | — |
| — | store-crud.js | — | — | — | — | — | 10+10 | — |
| — | soak.js (10m) | — | — | — | — | — | 5 | — |

_First run results should be committed to `tests/load/results/` to establish a
reference baseline for future regression detection._
