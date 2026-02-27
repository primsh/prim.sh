# I-19: OpenAPI Specs — Built Prims

**Status:** pending
**Goal:** Write (or complete) OpenAPI 3.1 specs for the 3 built-but-not-deployed prims: mem, domain, token.
**Depends on:** I-8 (prim.yaml schema V2)
**Scope:** `specs/openapi/{mem,domain,token}.yaml`
**Absorbs:** L-72 Phase 1

## Context

Existing drafts already exist in `specs/openapi/`:
- `specs/openapi/mem.yaml` (untracked)
- `specs/openapi/domain.yaml` (untracked)
- `specs/openapi/token.yaml` (untracked)

This task may be partially complete. The work is: review each draft against the I-18 standard, fill gaps, validate, and finalize.

## Source Data

| Prim | api.ts lines | Routes | Key types |
|------|-------------|--------|-----------|
| mem | ~104 | 10 | CreateCollectionRequest, UpsertRequest, QueryRequest, CacheEntry |
| domain | ~272 | 20 | DomainQuoteRequest, RegisterDomainRequest, ZoneResponse, DnsRecordRequest |
| token | ~118 | 9 | DeployTokenRequest, MintRequest, PoolCreateRequest, TokenResponse |

## Checklist Per Spec

Same standard as I-18. For each existing draft, verify:

- [ ] OpenAPI 3.1 format
- [ ] Every public route from index.ts is present
- [ ] operationId matches prim.yaml operation_id
- [ ] x-price extension on every paid endpoint
- [ ] Full JSON Schema for all request/response bodies
- [ ] Error envelope matches standard
- [ ] Pagination follows HRD-8 pattern (for list endpoints)
- [ ] Examples for every endpoint
- [ ] `npx @redocly/cli lint` passes

## Files to Create/Modify

| File | Action |
|------|--------|
| `specs/openapi/mem.yaml` | Review/complete existing draft |
| `specs/openapi/domain.yaml` | Review/complete existing draft |
| `specs/openapi/token.yaml` | Review/complete existing draft |

## Before Closing

- [ ] All 3 specs lint clean with redocly
- [ ] Specs match I-18 standard exactly (same security scheme, error envelope, pagination)
- [ ] Every endpoint covered with request/response schemas + examples
