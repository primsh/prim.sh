# L-33: Fix `prim wallet create` OpenSSL scrypt memory limit crash

**Status:** pending
**Depends on:** KS-1
**Blocks:** L-34 (done), L-35, L-36, L-11

## Context

`prim wallet create` crashes 100% of the time in production:

```
Error: Invalid scrypt params: error:06000084:public key routines:OPENSSL_internal:MEMORY_LIMIT_EXCEEDED
```

**Root cause:** `packages/keystore/src/crypto.ts` line 12 defaults to `N=131072` (Ethereum V3 standard). This requires `128 × N × r × p` = **128 MB** of memory. OpenSSL (which backs `node:crypto.scryptSync` in both Node.js and Bun) has a hard **32 MB limit** that cannot be configured.

Tests pass because they set `PRIM_SCRYPT_N=1024` in the environment.

**Max safe N:** 16,384 (requires 16 MB, under the 32 MB ceiling).

## Decision: Lower N to 16384

**Why not a JS/WASM scrypt library?** Adds a dependency for zero user benefit. Prim keystores are prim-only — agents don't import them into MetaMask or geth. V3 format compatibility (JSON structure, AES-128-CTR, keccak256 MAC) is preserved. Only the KDF cost parameter changes.

**Why N=16384 specifically?**
- Highest power-of-2 that fits under OpenSSL's 32 MB limit (16384 × 128 × 8 × 1 = 16 MB)
- Same N used by MetaMask in browser environments for identical reasons
- With r=8, p=1: still requires ~0.5s on modern hardware, sufficient for password-based key encryption
- Leaves 16 MB headroom under the limit (no need to push to the edge)

**Backward compatibility:** `decryptFromV3()` reads `kdfparams.n` from the stored keystore file, so any existing keystores (created with env-overridden N) will still decrypt correctly regardless of the new default.

## Changes

### Phase 1: Fix the default

**File:** `packages/keystore/src/crypto.ts`

**Change:** `getScryptN()` return value from `131072` to `16384`.

One line. That's it.

### Phase 2: Add a test that wallet creation works without env override

**File:** `packages/keystore/test/keystore.test.ts`

**Change:** Add one test that creates a key **without** `PRIM_SCRYPT_N` set, proving the default N works under OpenSSL limits.

```
Test: "createKey succeeds with default scrypt N (no PRIM_SCRYPT_N env)"
Setup: delete process.env.PRIM_SCRYPT_N
Action: createKey()
Assert: returns { address } matching /^0x[0-9a-fA-F]{40}$/
Teardown: restore PRIM_SCRYPT_N=1024
```

This test is the regression guard — if someone bumps N back up, this test fails on CI.

### Phase 3: Verify round-trip at default N

**Same file.** Add a test that encrypts and decrypts at the new default N:

```
Test: "encrypt/decrypt round-trip at default N=16384"
Setup: delete process.env.PRIM_SCRYPT_N
Action: encryptToV3(knownPrivateKey, password) → decryptFromV3(result, password)
Assert: decrypted key === knownPrivateKey
Assert: result.kdfparams.n === 16384
Teardown: restore PRIM_SCRYPT_N=1024
```

## Files Modified

| File | Change |
|------|--------|
| `packages/keystore/src/crypto.ts` | `131072` → `16384` in `getScryptN()` |
| `packages/keystore/test/keystore.test.ts` | 2 new tests (default-N creation + round-trip) |

## Before Closing

- [ ] `pnpm --filter @primsh/keystore test` passes (all existing + 2 new tests)
- [ ] `bun run packages/keystore/src/cli.ts wallet create` succeeds without `PRIM_SCRYPT_N` env set
- [ ] Created wallet decrypts successfully (`prim wallet balance` or `prim wallet export`)
- [ ] Existing test keystores (N=1024) still decrypt correctly
