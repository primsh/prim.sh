# HRD-22: Consistent verb-position convention in api.ts interface names

**Depends**: HRD-14 (done)

## Goal

Standardize all `api.ts` interface names to `VerbNounRequest`/`VerbNounResponse` ordering across all prims. The canonical pattern is **verb-first**: `CreateBucketRequest`, `DeleteServerResponse`, `RegisterWalletRequest`. No `NounVerbRequest` variants.

## Canonical pattern

```
<Verb><Noun>Request     e.g. CreateBucketRequest, RegisterWalletRequest
<Verb><Noun>Response    e.g. CreateBucketResponse, DeleteServerResponse
<Noun>Response          e.g. BucketResponse, ServerResponse  (read-only payloads — no verb needed)
```

Verbs: Create, Delete, Update, Set, Get, Register, Renew, Send, Verify, Recover, Activate, Configure, Resize, Rebuild, Upsert, Query, Drip, Pause, Resume, Quote, Search, Extract, Track, Generate, Describe, Upscale, Scaffold, Validate, Batch, Embed, Chat.

## Audit results

### Prims with NO violations (all names already follow VerbNounRequest/VerbNounResponse)

| Prim | Interfaces | Verdict |
|------|-----------|---------|
| **store.sh** | CreateBucketRequest, CreateBucketResponse, SetQuotaRequest, PutObjectResponse, DeleteObjectResponse, ReconcileResponse | All compliant |
| **spawn.sh** | CreateServerRequest, CreateServerResponse, DeleteServerResponse, ResizeRequest, ResizeResponse, RebuildRequest, RebuildResponse, CreateSshKeyRequest | All compliant |
| **domain.sh** | CreateZoneRequest, CreateZoneResponse, CreateRecordRequest, UpdateRecordRequest, QuoteRequest, QuoteResponse, RegisterRequest, RegisterResponse, RecoverRequest, RecoverResponse, BatchRecordsRequest, BatchRecordsResponse, MailSetupRequest, MailSetupResponse, ConfigureNsResponse, ActivateResponse, RegistrationStatusResponse, VerifyResponse | All compliant |
| **search.sh** | SearchRequest, SearchResponse, ExtractRequest, ExtractResponse | All compliant |
| **track.sh** | TrackRequest, TrackResponse | All compliant |
| **faucet.sh** | DripRequest, DripResponse, FaucetStatusResponse | All compliant |
| **token.sh** | CreateTokenRequest, CreatePoolRequest, MintRequest, MintResponse, SupplyResponse | All compliant |
| **infer.sh** | ChatRequest, ChatResponse, EmbedRequest, EmbedResponse, ModelsResponse | All compliant |
| **imagine.sh** | GenerateRequest, GenerateResponse, DescribeRequest, DescribeResponse, UpscaleRequest, UpscaleResponse, ModelsResponse | All compliant |
| **create.sh** | ScaffoldRequest, ScaffoldResponse, ValidateRequest, ValidateResponse, SchemaResponse, PortsResponse | All compliant |

### Prims with violations

#### wallet.sh (7 renames)

| Current name | New name | Reason |
|-------------|----------|--------|
| `WalletRegisterRequest` | `RegisterWalletRequest` | NounVerb → VerbNoun |
| `WalletRegisterResponse` | `RegisterWalletResponse` | NounVerb → VerbNoun |
| `WalletDeactivateResponse` | `DeactivateWalletResponse` | NounVerb → VerbNoun |
| `FundRequestCreateRequest` | `CreateFundRequestRequest` | NounVerb → VerbNoun |
| `FundRequestApproveResponse` | `ApproveFundRequestResponse` | NounVerb → VerbNoun |
| `FundRequestDenyRequest` | `DenyFundRequestRequest` | NounVerb → VerbNoun |
| `FundRequestDenyResponse` | `DenyFundRequestResponse` | NounVerb → VerbNoun |

Note: `FundRequestListResponse`, `PolicyResponse`, `PolicyUpdateRequest`, `PauseRequest`, `PauseResponse`, `ResumeRequest`, `ResumeResponse`, `WalletListItem`, `WalletDetailResponse`, `WalletListResponse`, `FundRequestResponse` are already compliant (response-only payloads or already verb-first).

#### email.sh (0 renames)

All email.sh interfaces already follow the convention: `CreateMailboxRequest`, `RenewMailboxRequest`, `SendMessageRequest`, `SendMessageResponse`, `RegisterWebhookRequest`, `RegisterDomainRequest`, `DeleteMailboxResponse`, `DeleteWebhookResponse`, `DeleteDomainResponse`, `VerifyDomainResponse`.

#### mem.sh (2 renames)

| Current name | New name | Reason |
|-------------|----------|--------|
| `CacheSetRequest` | `SetCacheRequest` | NounVerb → VerbNoun |
| `CacheGetResponse` | `GetCacheResponse` | NounVerb → VerbNoun |

## Files affected per rename

### wallet.sh renames

#### `WalletRegisterRequest` → `RegisterWalletRequest`

| File | References |
|------|-----------|
| `packages/wallet/src/api.ts` | Interface declaration (line 47) |
| `packages/wallet/src/service.ts` | Import (line 21), function param type (line 54) |
| `packages/wallet/src/index.ts` | Import (line 13), `Partial<>` type cast (lines 124, 126) |
| `packages/wallet/prim.yaml` | `request:` and `request_type:` fields (lines 87, 93) |
| `packages/wallet/README.md` | Route table + type heading (lines 11, 34) |
| `specs/openapi/wallet.yaml` | Schema ref (generated — will regenerate) |

#### `WalletRegisterResponse` → `RegisterWalletResponse`

| File | References |
|------|-----------|
| `packages/wallet/src/api.ts` | Interface declaration (line 60) |
| `packages/wallet/src/service.ts` | Import (line 22), return type (line 51) |
| `packages/wallet/prim.yaml` | `response:` and `response_type:` fields (lines 88, 94) |
| `packages/wallet/README.md` | Route table + type heading (lines 11, 44) |
| `specs/openapi/wallet.yaml` | Schema ref (generated — will regenerate) |

#### `WalletDeactivateResponse` → `DeactivateWalletResponse`

| File | References |
|------|-----------|
| `packages/wallet/src/api.ts` | Interface declaration (line 125) |
| `packages/wallet/src/service.ts` | Import (line 25), return type (line 210) |
| `packages/wallet/src/index.ts` | Import (line 16), type cast (line 201) |
| `packages/wallet/prim.yaml` | `response:` and `response_type:` fields (lines 128, 133) |
| `packages/wallet/README.md` | Route table + type heading (lines 14, 67) |
| `specs/openapi/wallet.yaml` | Schema ref (generated — will regenerate) |

#### `FundRequestCreateRequest` → `CreateFundRequestRequest`

| File | References |
|------|-----------|
| `packages/wallet/src/api.ts` | Interface declaration (line 136) |
| `packages/wallet/src/service.ts` | Import (line 26), function param type (line 246) |
| `packages/wallet/src/index.ts` | Import (line 40), `Partial<>` type cast (lines 212, 214) |
| `packages/wallet/prim.yaml` | `request:` and `request_type:` fields (lines 139, 144) |
| `packages/wallet/README.md` | Route table + type heading (lines 15, 75) |
| `specs/openapi/wallet.yaml` | Schema ref (generated — will regenerate) |

#### `FundRequestApproveResponse` → `ApproveFundRequestResponse`

| File | References |
|------|-----------|
| `packages/wallet/src/api.ts` | Interface declaration (line 163) |
| `packages/wallet/src/service.ts` | Import (line 29), return type (line 302) |
| `packages/wallet/src/index.ts` | Import (line 19), type cast (line 266) |
| `packages/wallet/prim.yaml` | `response:` and `response_type:` fields (lines 168, 173) |
| `packages/wallet/README.md` | Route table + type heading (lines 17, 93) |
| `specs/openapi/wallet.yaml` | Schema ref (generated — will regenerate) |

#### `FundRequestDenyRequest` → `DenyFundRequestRequest`

| File | References |
|------|-----------|
| `packages/wallet/src/api.ts` | Interface declaration (line 178) |
| `packages/wallet/src/index.ts` | Import (line 40), `Partial<>` type cast (line 279) |
| `packages/wallet/prim.yaml` | `request:` and `request_type:` fields (lines 180, 185) |
| `packages/wallet/README.md` | Route table + type heading (lines 18, 104) |
| `specs/openapi/wallet.yaml` | Schema ref (generated — will regenerate) |

#### `FundRequestDenyResponse` → `DenyFundRequestResponse`

| File | References |
|------|-----------|
| `packages/wallet/src/api.ts` | Interface declaration (line 183) |
| `packages/wallet/src/service.ts` | Import (line 30), return type (line 337) |
| `packages/wallet/src/index.ts` | Import (line 20), type cast (line 291) |
| `packages/wallet/prim.yaml` | `response:` and `response_type:` fields (lines 181, 186) |
| `packages/wallet/README.md` | Route table + type heading (lines 18, 110) |
| `specs/openapi/wallet.yaml` | Schema ref (generated — will regenerate) |

### mem.sh renames

#### `CacheSetRequest` → `SetCacheRequest`

| File | References |
|------|-----------|
| `packages/mem/src/api.ts` | Interface declaration (line 111) |
| `packages/mem/src/service.ts` | Import (line 32), function param type (line 352) |
| `packages/mem/src/index.ts` | Import (line 19), `json<>` type cast (line 188) |
| `packages/mem/prim.yaml` | `request:` and `request_type:` fields (lines 179, 184) |
| `packages/mem/README.md` | Route table + type heading (lines 17, 79) |
| `specs/openapi/mem.yaml` | Schema ref (generated — will regenerate) |

#### `CacheGetResponse` → `GetCacheResponse`

| File | References |
|------|-----------|
| `packages/mem/src/api.ts` | Interface declaration (line 118) |
| `packages/mem/src/service.ts` | Import (line 33), return type (lines 88, 354, 395, 402, 415) |
| `packages/mem/src/index.ts` | Import (line 20), type cast (lines 198, 211) |
| `packages/mem/prim.yaml` | `response:` and `response_type:` fields (lines 191, 196) |
| `packages/mem/README.md` | Route table + type heading (lines 18, 86) |
| `specs/openapi/mem.yaml` | Schema ref (generated — will regenerate) |

## Implementation approach

Each rename is a global find-and-replace within its package. The renames are purely mechanical — no logic changes, no new exports, no signature changes.

1. For each rename in `api.ts`: rename the interface declaration
2. In `service.ts`, `index.ts`: update all imports and type references (find-replace old name → new name)
3. In `prim.yaml`: update `request:`, `response:`, `request_type:`, `response_type:` values
4. In `README.md`: update route table cells and type heading anchors
5. Run `pnpm gen` to regenerate OpenAPI specs, MCP configs, CLI tools, and other derived outputs
6. Run `pnpm -r check` to verify nothing broke

### Ordering

All 9 renames are independent — they touch different type names. The wallet renames and mem renames can be done in any order.

### Summary

| Prim | Renames | Source files touched | Config files touched |
|------|---------|---------------------|---------------------|
| wallet.sh | 7 | api.ts, service.ts, index.ts | prim.yaml, README.md |
| mem.sh | 2 | api.ts, service.ts, index.ts | prim.yaml, README.md |
| **Total** | **9** | **6 source files** | **4 config files** |

Plus regenerated outputs: `specs/openapi/wallet.yaml`, `specs/openapi/mem.yaml`, MCP configs, CLI tool definitions.

## Before closing

- [ ] Run `pnpm -r check` (lint + typecheck + test — all packages pass)
- [ ] Run `pnpm gen:check` to confirm generated files are up to date
- [ ] Verify every old name has zero grep hits across the repo: `grep -r 'WalletRegisterRequest\|WalletRegisterResponse\|WalletDeactivateResponse\|FundRequestCreateRequest\|FundRequestApproveResponse\|FundRequestDenyRequest\|FundRequestDenyResponse\|CacheSetRequest\|CacheGetResponse' packages/`
- [ ] Spot-check that OpenAPI schemas use the new names (wallet.yaml, mem.yaml)
- [ ] Verify README type headings match the new interface names
