---
name: multi-prim
version: 1.0.0
primitive: prim.sh
requires: [wallet]
tools:
  - wallet_register_wallet
  - wallet_create_fund_request
  - faucet_drip_usdc
  - faucet_get_faucet_status
  - store_create_bucket
  - store_put_object
  - store_get_object
  - store_list_objects
  - store_delete_object
  - store_get_quota
  - store_set_quota
  - spawn_create_server
  - spawn_get_server
  - spawn_delete_server
  - spawn_create_ssh_key
  - search_search_web
  - search_search_news
  - search_extract_url
  - email_create_mailbox
  - email_send_message
  - email_register_domain
  - email_verify_domain
  - email_register_webhook
  - mem_create_collection
  - mem_upsert_documents
  - mem_query_collection
  - domain_search_domains
  - domain_quote_domain
  - domain_get_domain_status
  - domain_create_zone
  - domain_setup_mail
  - domain_verify_zone
  - domain_activate_zone
  - domain_create_record
  - domain_batch_records
  - token_deploy_token
  - token_mint_tokens
  - token_create_pool
---

# Multi-Primitive Workflows

Cross-primitive patterns. Assumes a registered, funded wallet.

---

## 1. Onboarding to first use

```
1. wallet_register_wallet (address, signature, timestamp)
2. faucet_get_faucet_status → check usdc.available
3. faucet_drip_usdc → 10 test USDC
4. store_create_bucket → ready to use
```

Production: replace faucet with `wallet_create_fund_request` → notify human operator.

---

## 2. Research pipeline: search → extract → store

```
1. search_search_web (query, max_results: 10, include_answer: true)
2. store_create_bucket (name: "research-...")
3. store_put_object (key: "search-results.json", content: <results>)
4. search_extract_url (urls: <top 3 URLs>, format: "markdown")
5. store_put_object for each extracted page (key: "extracted/<n>.md")
```

Search results are cached in store; re-query store instead of re-paying for search.

---

## 3. Deploy server with config: spawn → store

```
1. spawn_create_ssh_key (name, public_key) → key_id
2. store_create_bucket + store_put_object (upload configs)
3. spawn_create_server (type: "small", image, location, ssh_keys: [key_id], user_data: <cloud-init>)
4. Poll spawn_get_server until status = "running" → get IP
5. store_get_object → pull config to server
```

---

## 4. Server lifecycle with backup

```
PROVISION: spawn_create_ssh_key → spawn_create_server → poll spawn_get_server
USE: deploy workload

BEFORE DESTROY:
  store_create_bucket → store_put_object (backup data as .tar.gz)

DESTROY: spawn_delete_server → deposit refunded

RESTORE: store_get_object → spawn_create_server (new instance)
```

---

## 5. Knowledge base: search → mem

```
1. mem_create_collection (name: "knowledge-base")
2. search_search_web (query, max_results: 10)
3. mem_upsert_documents (documents: [{text: result.content, metadata: {url, title}}])
4. Later: mem_query_collection (text: "question?", top_k: 5) → semantic search
```

Unlike store (raw bytes), mem enables semantic search — query by meaning, not by key.

---

## 6. Agent identity: wallet → email → custom domain

```
1. wallet_register_wallet → wallet address
2. email_create_mailbox (username: "my-agent") → address: "my-agent@email.prim.sh"
3. domain_search_domains + domain_quote_domain → find and price domain
4. [register domain] → zone_id, nameservers
5. domain_activate_zone → zone active
6. domain_setup_mail (mail_server: "mail.prim.sh") → MX + SPF + DKIM
7. email_register_domain (domain) → register with Stalwart
8. email_verify_domain → confirm DNS propagated
```

Agent now has: wallet (0x...) + email (agent@myagent.sh) + custom domain (myagent.sh).

---

## 7. Token launch: deploy → pool → project site

```
1. token_deploy_token (name, symbol, initialSupply, mintable: true)
   → poll token_get_token until deployStatus: "confirmed"
2. token_create_pool (pricePerToken: "0.001", feeTier: 3000)
3. domain_search_domains + domain_quote_domain + [register]
4. domain_create_zone + domain_create_record (A record → server IP)
5. spawn_create_server (name: "project-site")
```

---

## 8. Custom email domain: domain → email

```
1. domain_quote_domain + [register domain] → zone_id
2. domain_setup_mail (mail_server: "mail.prim.sh", mail_server_ip: <IP>)
3. domain_verify_zone → confirm records propagated
4. email_register_domain (domain) → register with email.prim.sh
5. email_verify_domain → confirm
6. email_create_mailbox (username: "hello", domain: "myproject.sh")
   → address: "hello@myproject.sh"
```

---

## Cross-primitive error recovery

**`quota_exceeded` during research pipeline:**
```
store_get_quota → check usage_bytes
store_list_objects → store_delete_object (old entries)
store_set_quota (quota_bytes: 209715200)  # increase to 200 MB
```

**`server_limit_exceeded` during deploy:**
```
spawn_list_servers → identify idle servers
spawn_delete_server → release deposit
spawn_create_server (retry)
```

**`provider_error` (502) from search:**
- Retry once after 5s. If persistent, switch `search_search_web` ↔ `search_search_news`.

**Partial extraction failure:**
- `search_extract_url` returns HTTP 200 even when some URLs fail. Check `failed[]`. Non-empty `failed[]` is not fatal.
