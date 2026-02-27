# SITE-9 — Per-product install.sh: generate, serve, hero display

## Context

Each primitive needs an install script at `https://{endpoint}/install.sh` that a human can
hand to an agent as a single command. That script installs the prim CLI **and** that
primitive's MCP skills in one shot. The hero block on each product page should show this
one-liner as the primary CTA instead of the current API usage example.

```
curl -fsSL https://wallet.prim.sh/install.sh | sh
```

Running that command:
1. Detects + installs Bun (if missing)
2. Downloads + checksums the prim CLI bundle from `dl.prim.sh/latest`
3. Installs the CLI wrapper to `~/.prim/bin/prim`
4. Adds `~/.prim/bin` to PATH
5. Runs `prim install wallet` — registers wallet MCP tools with the agent's config
   (auto-detects Claude `~/.claude/mcp.json` or Cursor `.cursor/mcp.json`)

## Goals

1. Generate a per-product `install.sh` for every non-`soon` primitive
2. Serve it at `/<id>/install.sh` via the site server
3. Show it in the hero cmd-block instead of the API usage example

## Files

| File | Change |
|------|--------|
| `scripts/gen-install-scripts.ts` | New — generator script |
| `packages/<id>/install.sh` | Generated for each non-`soon` primitive |
| `site/serve.ts` | Add `/<id>/install.sh` route |
| `site/template.ts` | Replace hero_example cmd-block with install command |

## Phase A — Generator script

**`scripts/gen-install-scripts.ts`**

- Read `site/install.sh` as the base template
- Discover all prim IDs by scanning `packages/*/prim.yaml` and `site/*/prim.yaml`
- Skip primitives with `status: soon`
- For each primitive, produce a customized install.sh:
  - Replace header comment block with: `# Install <name> — prim.sh` and the correct usage URL
  - Replace the final echo block ("Then try: prim wallet create") with the primitive-specific message
  - Append `prim install <id>` call after the CLI is installed (see insertion point below)
- Write to `packages/<id>/install.sh`, make executable (`chmod 0755`)
- Log each file written; exit 0

**Insertion point in base install.sh:**

The base script ends with:
```sh
VERSION=$("$BIN" --version 2>/dev/null || echo "unknown")
echo ""
echo "prim v${VERSION} installed to $BIN"
...
echo "  prim wallet create"
```

In generated scripts, between the `chmod +x "$BIN"` line and the `PATH_LINE` block, add:
```sh
# Install <name> skills
"$BIN" install <id>
```

And replace the closing echo with:
```sh
echo "  <name> installed. Your agent can now use <id> tools."
```

**Run condition:** Add `gen-install-scripts` as an optional step in CI or as a pre-commit
hook. Do not auto-run on every `pnpm install` — run explicitly via `bun scripts/gen-install-scripts.ts`.

## Phase B — Serve route

**`site/serve.ts`**

Add a route above the existing `/<prim-id>` catch-all:

```
/<id>/install.sh  →  packages/<id>/install.sh  (fallback: site/<id>/install.sh)
```

- Match pattern: `pathname.match(/^\/([^/]+)\/install\.sh$/)`
- Serve via existing `serveFile()` helper
- Content-Type: `text/plain; charset=utf-8`  (already handled by `mimeFor` for `.sh`)
- Return 404 if the file doesn't exist (not every primitive will have one yet)

## Phase C — Template hero block

**`site/template.ts`**

In `render()`, replace the `heroBlock` generation:

Current:
```typescript
const heroBlock = cfg.hero_example
  ? `  <div class="cmd-block">...colorizeHeroBlock(cfg.hero_example)...</div>`
  : "";
```

New — always generate from `cfg.endpoint`:
```typescript
const installCmd = `curl -fsSL https://${cfg.endpoint}/install.sh | sh`;
const heroBlock = `  <div class="cmd-block"><code>` +
  `<span class="prompt">$</span> ` +
  `<span class="a">curl</span> ` +
  `<span class="flag">-fsSL</span> ` +
  `<span class="w">${esc(`https://${cfg.endpoint}/install.sh`)}</span> ` +
  `<span class="flag">|</span> ` +
  `bash` +
  `</code><button class="copy-btn" ...>copy</button></div>`;
```

Use the existing copy-btn onclick already in the template. The `hero_example` field is
no longer rendered in the hero block — leave it in the YAML for now (it drives nothing
until a "Quick start" section is added in a future task).

Keep the `heroBlock` present for `renderComingSoon()` too — but coming-soon pages skip
sections and don't show the install block (their status is `soon`).

## Key design decisions

- **Install command is auto-generated** from `cfg.endpoint` — no YAML change needed
- **`hero_example` is not deleted** from YAML files; it will be repurposed in a follow-up task
- **Wallet dependency is handled by the CLI**, not the install script. `prim install <id>`
  already emits a note when wallet MCP tools are also needed. The generated script just calls
  `"$BIN" install <id>` — no REQUIRES_WALLET logic in the shell script.
- **Idempotency:** running the install script twice should not break anything — `prim install`
  is already idempotent (it upserts the MCP config entry)

## Before closing

- [ ] `bun scripts/gen-install-scripts.ts` completes without error, writes files for all non-`soon` prims
- [ ] `curl localhost:3000/wallet/install.sh` returns a valid shell script containing `prim install wallet`
- [ ] Hero block on wallet page shows `curl -fsSL https://wallet.prim.sh/install.sh | sh`
- [ ] Coming-soon pages are unaffected
- [ ] `pnpm -r check` passes
