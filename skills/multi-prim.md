---
name: multi-prim
version: 1.0.0
primitive: prim.sh
requires: [wallet]
tools:
  - wallet_register
  - wallet_fund_request_create
  - faucet_usdc
  - faucet_status
  - store_bucket_create
  - store_object_put
  - store_object_get
  - store_object_list
  - spawn_server_create
  - spawn_server_get
  - spawn_server_delete
  - spawn_ssh_key_create
  - search_web
  - search_news
  - search_extract
---

# Multi-Primitive Workflows

Cross-primitive patterns. Each section describes a workflow that combines two or more prims to accomplish a complete task.

---

## 1. Onboarding to first use

Complete sequence from zero to using a paid primitive.

```
1. wallet_register
   - address, signature, timestamp
   → wallet registered

2. faucet_status
   - address: <wallet address>
   → check usdc.available

3. faucet_usdc
   - address: <wallet address>
   → 10 test USDC credited

4. store_bucket_create
   - name: "my-first-bucket"
   → bucket ready for use
```

**If on production (not testnet):**
Replace step 2–3 with:
```
wallet_fund_request_create
- walletAddress: <address>
- amount: "10.00"
- reason: "Initial funding for research pipeline"
→ notify human operator, poll for approval
```

---

## 2. Research pipeline: search → store → extract

Search the web, persist results, then deep-dive on specific URLs.

```
1. search_web
   - query: "x402 payment protocol documentation"
   - max_results: 10
   - include_answer: true
   → {answer, results: [{title, url, content, score}, ...]}

2. store_bucket_create
   - name: "research-x402"
   → {bucket: {id: "bkt_abc..."}}

3. store_object_put
   - bucket_id: "bkt_abc..."
   - key: "search-results/x402-docs.json"
   - content: <JSON of search results>
   - content_type: "application/json"
   → cached for future access without re-paying

4. Pick top 3 URLs by score from step 1:
   search_extract
   - urls: ["https://url1", "https://url2", "https://url3"]
   - format: "markdown"
   → {results: [{url, content, images}], failed: [...]}

5. store_object_put for each extracted page:
   - bucket_id: "bkt_abc..."
   - key: "extracted/url1.md"
   - content: <extracted markdown>
```

Now you have the full research corpus stored and searchable by prefix.

---

## 3. Deploy and configure: spawn → store

Provision a server and deploy configuration from storage.

```
1. spawn_ssh_key_create
   - name: "deploy-key"
   - public_key: "ssh-ed25519 AAAA..."
   → {id: "key_abc123", fingerprint: "SHA256:..."}

2. store_bucket_create
   - name: "server-configs"
   → {bucket: {id: "bkt_config..."}}

3. store_object_put
   - bucket_id: "bkt_config..."
   - key: "nginx/nginx.conf"
   - content: <nginx config bytes>
   → config stored

4. spawn_server_create
   - name: "web-server"
   - type: "small"
   - image: "ubuntu-24.04"
   - location: "nyc3"
   - ssh_keys: ["key_abc123"]
   - user_data: |
       #!/bin/bash
       apt-get install -y nginx
   → {server: {id: "srv_xyz...", status: "initializing"}}

5. Poll spawn_server_get until status = "running":
   spawn_server_get with id "srv_xyz..."
   → wait for {status: "running", public_net: {ipv4: {ip: "1.2.3.4"}}}

6. SSH into 1.2.3.4, or use user_data to pull config from store:
   store_object_get
   - bucket_id: "bkt_config..."
   - key: "nginx/nginx.conf"
   → stream config to server via scp or inline in user_data
```

---

## 4. Server lifecycle with data backup

Provision → use → back up data → destroy → restore later.

```
PROVISION:
1. spawn_ssh_key_create + spawn_server_create (see workflow 3)
2. Poll until running, deploy your workload

BEFORE DESTROYING:
3. SSH into server, dump data to local file

4. store_bucket_create
   - name: "server-backup-srv_xyz"

5. store_object_put
   - bucket_id: <backup bucket>
   - key: "2026-02-26/data.tar.gz"
   - content: <backup bytes>

DESTROY:
6. spawn_server_delete with server id
   → deposit_refunded: "3.50"

RESTORE LATER:
7. store_object_get
   - bucket_id: <backup bucket>
   - key: "2026-02-26/data.tar.gz"
   → retrieve backup

8. spawn_server_create (new server)
9. Deploy backup to new server
```

---

## 5. News monitoring pipeline

Watch a topic, save new articles, avoid re-fetching duplicates.

```
DAILY RUN:

1. search_news
   - query: "Base L2 Ethereum"
   - time_range: "day"
   - max_results: 20
   → results with published timestamps

2. store_bucket_create (once, reuse id after):
   - name: "news-monitor"

3. For each result not already stored:
   store_object_list
   - bucket_id: <news bucket>
   - prefix: "articles/<result.url hash>/"
   → if not found, it's new

4. For new articles:
   search_extract
   - urls: [result.url]
   - format: "markdown"
   → full content

5. store_object_put
   - key: "articles/<hash>/content.md"
   - content: <extracted markdown>

6. store_object_put
   - key: "articles/<hash>/meta.json"
   - content: {url, title, published, score}
```

---

## 6. Multi-source research with deduplication

Combine web + news search, extract top results, avoid duplicates.

```
1. search_web
   - query: "USDC stablecoin mechanism"
   - max_results: 10
   → web_results

2. search_news
   - query: "USDC stablecoin"
   - time_range: "month"
   - max_results: 10
   → news_results

3. Merge URLs, deduplicate by URL string

4. search_extract
   - urls: <deduplicated top 5 URLs>
   - format: "markdown"
   → {results: [...], failed: [...]}

5. store_object_put each extracted page for caching
```

---

## Error handling across primitives

**Wallet funded but still getting 402:**
- Wallet must be on the access allowlist. Submit an access request via `POST https://api.prim.sh/api/access/request`.

**store returns `quota_exceeded` during research pipeline:**
```
1. store_quota_get with bucket_id
   → check usage_bytes vs quota_bytes

2. Delete old objects:
   store_object_list → store_object_delete for outdated entries

3. Or increase quota:
   store_quota_set with {quota_bytes: 209715200}  (200 MB)
```

**spawn returns `server_limit_exceeded` during deploy workflow:**
```
1. spawn_server_list → find idle servers
2. spawn_server_delete idle servers
3. Retry spawn_server_create
```

**search returns `provider_error` (502):**
- Retry once after 5 seconds. If still failing, fall back to `search_news` or reduce `max_results`.

**Partial extraction failure in research pipeline:**
- `search_extract` returns 200 even when some URLs fail. Check `failed[]` and either retry those URLs or skip them. Do not treat a non-empty `failed[]` as a fatal error.
