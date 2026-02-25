# ST-6: `prim store` CLI

**Date:** 2026-02-25
**Depends on:** KS-1 (keystore + CLI scaffold), ST-2 (store.sh object CRUD)
**Package:** `packages/keystore` (the `prim` binary lives here)

## Context

The `prim` binary currently supports only `prim wallet <subcommand>`. The agent-dx spec (Phase 2) calls for primitive subcommands — `prim store`, `prim email`, `prim spawn` — that let agents interact with prim.sh services from the CLI with automatic x402 payment signing via the local keystore.

`prim store` is the first primitive subcommand. It wraps every store.sh endpoint behind a CLI interface, using `createPrimFetch({ keystore: true })` for transparent x402 payment.

## Goals

- Agent runs `prim store create-bucket --name foo` and gets a bucket — no raw HTTP, no manual signing
- All 7 store operations accessible as CLI subcommands
- Reads wallet from `~/.prim/keys/` (default or explicit `--wallet`)
- Reads store.sh base URL from config or `--url` flag
- Outputs JSON by default (machine-parseable), with `--quiet` for minimal output

## Subcommand Design

```
prim store create-bucket --name NAME [--location HINT]
prim store ls [--page N] [--per-page N]
prim store put BUCKET_ID KEY [--file PATH | stdin]
prim store get BUCKET_ID KEY [--out PATH | stdout]
prim store rm BUCKET_ID KEY
prim store rm-bucket BUCKET_ID
prim store quota BUCKET_ID
```

### Argument & flag conventions

- Positional args for resource identifiers (bucket ID, object key)
- `--name`, `--location`, `--file`, `--out`, `--page`, `--per-page` are named flags
- `--wallet ADDRESS` overrides default wallet (passed to keystore)
- `--passphrase[=VALUE]` for passphrase-encrypted keys (same semantics as `prim wallet`)
- `--url URL` overrides store.sh base URL (default: `https://store.prim.sh` or `PRIM_STORE_URL` env)
- `--quiet` suppresses JSON output, prints only the essential value (e.g., bucket ID on create)
- `--max-payment AMOUNT` overrides default x402 cap (default `"1.00"`)

### Input/output contracts per subcommand

| Subcommand | HTTP | Stdin/file input | Stdout output | Quiet output |
|---|---|---|---|---|
| `create-bucket` | `POST /v1/buckets` | — | Full bucket JSON | Bucket ID |
| `ls` | `GET /v1/buckets` | — | Bucket list JSON (with meta) | One bucket ID per line |
| `put` | `PUT /v1/buckets/:id/objects/*` | File body (`--file` or stdin) | Put result JSON `{key,size,etag}` | Key |
| `get` | `GET /v1/buckets/:id/objects/*` | — | Raw file bytes to stdout (or `--out` file) | (same — raw bytes) |
| `rm` | `DELETE /v1/buckets/:id/objects/*` | — | `{"status":"deleted"}` | Nothing |
| `rm-bucket` | `DELETE /v1/buckets/:id` | — | `{"status":"deleted"}` | Nothing |
| `quota` | `GET /v1/buckets/:id/quota` | — | Quota JSON `{quota_bytes,usage_bytes,usage_pct}` | Usage bytes |

### Content-Type for `put`

- `--file PATH`: Infer from extension via a small lookup (`.txt`→`text/plain`, `.json`→`application/json`, `.html`→`text/html`, etc.). Fallback: `application/octet-stream`.
- Stdin: `application/octet-stream` (no extension to infer from).
- `--content-type TYPE` flag to override.

## Architecture

### Dependency direction

```
cli.ts (prim binary)
  ├── wallet subcommands  → imports from ./keystore.ts, ./config.ts
  └── store subcommands   → imports from ./store-commands.ts (NEW)
                               └── imports createPrimFetch from @prim/x402-client
                               └── imports loadAccount, getConfig from ./keystore.ts, ./config.ts
```

`@prim/x402-client` is already a dependency of `@prim/keystore` (lazy-loaded). The store commands use `createPrimFetch({ keystore: true })` or `createPrimFetch({ keystore: { address, passphrase } })` depending on flags.

No new packages. All code lives in `packages/keystore/src/`.

### Files to modify/create

| File | Change |
|---|---|
| `packages/keystore/src/cli.ts` | Add `"store"` case to the group router (alongside `"wallet"`). Delegate to `runStoreCommand(subcommand, argv)`. Update usage string. |
| `packages/keystore/src/store-commands.ts` | **NEW.** All 7 store subcommand implementations. One exported function: `runStoreCommand(sub: string, argv: string[]): Promise<void>`. |
| `packages/keystore/package.json` | Add `@prim/x402-client` to `dependencies` (currently only in devDependencies for tests — needs to be runtime dep for CLI usage). |

### URL resolution

1. `--url` flag → use directly
2. `PRIM_STORE_URL` env → use directly
3. Default: `https://store.prim.sh`

Store this logic in `store-commands.ts` as a `resolveStoreUrl()` helper.

### x402 fetch creation

```
const primFetch = createPrimFetch({
  keystore: walletFlag ? { address: walletFlag, passphrase } : true,
  maxPayment: maxPaymentFlag ?? "1.00",
  network: config.network,  // from ~/.prim/config.toml
});
```

Created once at the start of `runStoreCommand`, reused for the HTTP call.

### `put` body handling

| Source | Content-Length | Body |
|---|---|---|
| `--file PATH` | `stat(PATH).size` | `Bun.file(PATH).stream()` or `readFileSync(PATH)` |
| stdin (no `--file`) | Unknown until read | Buffer stdin fully via `Bun.stdin.arrayBuffer()`, then send with known length |

store.sh requires `Content-Length` when quota is set — always send it. For files, stat gives the size. For stdin, buffer first.

### `get` output handling

- Default (no `--out`): Pipe response body to `process.stdout` as raw bytes via `res.body.pipeTo(Bun.stdout.writer())`
- `--out PATH`: Write response body to file via `Bun.write(PATH, res.body)`

### Error handling

All subcommands follow the same pattern:
1. Call `primFetch(url, opts)`
2. If `!res.ok`, parse JSON error body `{ error: { code, message } }`, print `Error: <message> (<code>)` to stderr, exit 1
3. If x402 payment fails (thrown by createPrimFetch), the error propagates to the try/catch in `cli.ts` which already prints `Error: <message>` and exits 1

## Shared flag parsing

The existing `getFlag(name)` and `hasFlag(name)` helpers in `cli.ts` parse from the module-level `argv` array. These should be extracted or made accessible to `store-commands.ts`.

Two options:
- **Option A:** Pass the raw argv slice to `runStoreCommand` and let it do its own parsing with local copies of `getFlag`/`hasFlag`.
- **Option B:** Extract flag parsing to a `flags.ts` module.

**Decision:** Option A. The flag helpers are 6 lines total. Duplicating them keeps store-commands self-contained without a premature abstraction. If a third command group appears (email, spawn), extract then.

## Testing strategy

### Unit tests: `packages/keystore/test/store-commands.test.ts` (NEW)

Mock `createPrimFetch` to return a fake `fetch` that records calls and returns canned responses. Test:

1. **create-bucket** — verify POST to `/v1/buckets` with `{ name }` body, verify JSON output
2. **ls** — verify GET to `/v1/buckets`, verify paginated JSON output
3. **put from file** — verify PUT to `/v1/buckets/:id/objects/key` with file body + Content-Length + Content-Type
4. **put from stdin** — verify stdin buffering, Content-Length set from buffer size
5. **get to stdout** — verify GET, raw body piped to stdout
6. **get to file** — verify `--out` writes to disk
7. **rm** — verify DELETE to `/v1/buckets/:id/objects/key`
8. **rm-bucket** — verify DELETE to `/v1/buckets/:id`
9. **quota** — verify GET to `/v1/buckets/:id/quota`
10. **--quiet** — verify minimal output for create-bucket, ls, put
11. **error handling** — verify non-ok response prints error and exits 1
12. **URL resolution** — verify `--url` flag > `PRIM_STORE_URL` env > default

### Assertions

- `assert` that `primFetch` was called with the correct URL, method, headers, and body
- `assert` stdout output matches expected JSON (or quiet format)
- `assert` exit code is 0 on success, 1 on error

### What NOT to test

- The x402 payment flow itself (tested in x402-client)
- The keystore loading (tested in keystore tests)
- The store.sh server behavior (tested in store package tests)

## Decision table: `put` body source

| `--file` flag | stdin is TTY | Behavior |
|---|---|---|
| `--file=path` | any | Read from file |
| absent | false (piped) | Read from stdin |
| absent | true (interactive) | Error: "Provide --file or pipe data via stdin" |

## Before closing

- [ ] Run `pnpm -C packages/keystore test` — all tests pass
- [ ] Run `pnpm -C packages/keystore check` — lint + typecheck pass
- [ ] Verify each subcommand works with `bun run packages/keystore/src/cli.ts store <sub>` (manual smoke)
- [ ] Re-read each subcommand contract above and verify the implementation matches
- [ ] For `put` body source, verify both `--file` and stdin paths are tested
- [ ] Verify `--quiet` flag works for all subcommands that document it
- [ ] Verify error handling: non-ok HTTP response prints error to stderr and exits 1
