# L-11: Compile `prim` binary for 4 platforms + GitHub Release

**Status:** pending
**Depends on:** L-33 (scrypt crash must be fixed first — binary won't work otherwise)
**Blocks:** L-12 (install script needs binaries to download)

## Context

Most infrastructure already exists:
- `scripts/build-binary.sh` — compiles 4 targets via `bun build --compile`
- `.github/workflows/release.yml` — matrix build (4 platforms), artifact upload, `gh release create`
- CLI entrypoint: `packages/keystore/src/cli.ts`

## What's Missing

### 1. release.yml: add x402-middleware build step

The release workflow runs `bun build` but doesn't build the workspace dependency first. CI workflow (`ci.yml`) does this correctly.

**File:** `.github/workflows/release.yml`
**Change:** Add `pnpm --filter @primsh/x402-middleware build` before the `bun build` step in the build job.

### 2. Verify binary compiles after L-33 fix

Once scryptSync is replaced (L-33), run locally:

```bash
./scripts/build-binary.sh
```

Verify all 4 binaries appear in `dist/` and the local-arch one runs:

```bash
./dist/prim-darwin-arm64 --version
./dist/prim-darwin-arm64 wallet --help
```

### 3. Version bump

Set version in `packages/keystore/package.json` to `0.1.0` (or whatever first release version is).

### 4. Tag + push

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers release.yml → builds 4 binaries → creates GitHub Release with all 4 attached.

### 5. Verify release

- Check `https://github.com/primsh/prim.sh/releases/tag/v0.1.0`
- Download each binary, verify it runs on target platform (at minimum: local macOS + VPS Linux)

## Platform Targets

| Target | Runner | Binary name |
|--------|--------|-------------|
| `bun-darwin-arm64` | `macos-latest` | `prim-darwin-arm64` |
| `bun-darwin-x64` | `macos-latest` | `prim-darwin-x64` |
| `bun-linux-x64` | `ubuntu-latest` | `prim-linux-x64` |
| `bun-linux-arm64` | `ubuntu-latest` | `prim-linux-arm64` |

## Risks

- **Bun cross-compile quirks:** `bun build --compile --target=bun-linux-arm64` on macOS may produce a binary that fails on actual ARM Linux. release.yml uses native runners for each OS which avoids this for darwin vs linux, but both linux targets run on `ubuntu-latest` (x64). The ARM64 Linux binary is cross-compiled.
  - **Mitigation:** Test ARM64 binary on VPS if it's ARM, or accept as known gap.
- **viem bundle size:** viem is large. Binary may be 50-100MB. Not a blocker but worth noting.

## Before Closing

- [ ] `./scripts/build-binary.sh` succeeds locally
- [ ] Local binary runs `prim --version`, `prim wallet --help`, `prim store --help`
- [ ] release.yml includes x402-middleware build step
- [ ] Git tag pushed, GitHub Release created with 4 binaries
- [ ] At least 2 binaries verified (macOS local + Linux VPS)
