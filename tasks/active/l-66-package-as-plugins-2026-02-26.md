# L-66: Package as Plugins

**Status:** Planning
**Depends on:** L-64 (MCP servers — done), L-65 (Skills — done)
**Goal:** `prim install store` drops MCP config + skill into the agent's environment. One command to go from "prim is installed" to "agent can use store tools".

---

## Context

After L-64 and L-65, each primitive has an MCP server (`packages/mcp/`) and a skill file (`skills/<name>.md`). But there's no automated way to wire these into an agent's environment. Today a user must manually edit `~/.claude/mcp.json` or `.cursor/mcp.json` and copy skill files by hand. L-66 closes the last-mile gap.

### What exists today

| Artifact | Location | Format |
|----------|----------|--------|
| MCP server | `packages/mcp/` | Unified server, filterable via `--primitives` |
| Skills | `skills/{wallet,store,spawn,faucet,search}.md` | Markdown + YAML frontmatter |
| CLI dispatcher | `packages/keystore/src/cli.ts` | Dynamic import per command group |
| Config | `~/.prim/config.toml` | `default_wallet`, `network` |
| Paths module | `packages/keystore/src/paths.ts` | `getPrimDir()` → `~/.prim` |
| Install script | `site/install.sh` | Downloads binary to `~/.prim/bin/prim` |

---

## Design

### No `plugins/` directory at build time

The wave-5.5 umbrella plan proposed a `plugins/` directory with manifest.json + mcp-config.json + skill.md per primitive. This is unnecessary indirection — the `install` command can generate MCP config from the known primitive list and reference skills by name. Keep the data inline in the command module rather than shipping static JSON that must stay in sync with the server.

### Agent environment detection

Three target environments, detected in this order:

| Agent | MCP config path | Skill destination | Detection |
|-------|----------------|-------------------|-----------|
| Claude Code | `~/.claude/mcp.json` | Print instructions (no standard skill dir) | `~/.claude/` dir exists |
| Cursor | `<project>/.cursor/mcp.json` | Print instructions | `.cursor/` in cwd or parent |
| Generic | stdout (JSON) | stdout | Fallback / `--agent generic` |

The `--agent` flag overrides auto-detection. Values: `claude`, `cursor`, `generic`.

### Agent detection algorithm

```
if --agent flag provided → use that
else if $HOME/.claude/ exists → claude
else if .cursor/ found in cwd or any parent (up to 5 levels) → cursor
else → generic
```

| --agent flag | ~/.claude/ exists | .cursor/ in cwd tree | Result |
|-------------|-------------------|---------------------|--------|
| claude      | any               | any                 | claude |
| cursor      | any               | any                 | cursor |
| generic     | any               | any                 | generic |
| (none)      | yes               | any                 | claude |
| (none)      | no                | yes                 | cursor |
| (none)      | no                | no                  | generic |

### MCP config generation

For `prim install store`, generate:

```json
{
  "mcpServers": {
    "prim-store": {
      "command": "prim",
      "args": ["mcp", "--primitives", "store"]
    }
  }
}
```

For `prim install all` (or no argument), generate:

```json
{
  "mcpServers": {
    "prim": {
      "command": "prim",
      "args": ["mcp"]
    }
  }
}
```

Key name: `"prim-<name>"` for individual, `"prim"` for all.

### Config merge strategy

When writing to an agent's mcp.json:

1. Read existing file (or `{}` if missing)
2. Parse as JSON — if parse fails, abort with error (don't clobber user's file)
3. Ensure `mcpServers` key exists (create as `{}` if missing)
4. Check for existing `prim-<name>` or `prim` key — if exists, overwrite with new config (idempotent reinstall)
5. Write back with 2-space indentation + trailing newline
6. **Never remove other mcpServers entries** — only add/update prim entries

| File exists | Valid JSON | prim key exists | Action |
|------------|-----------|-----------------|--------|
| no         | n/a       | n/a             | Create file with new config |
| yes        | yes       | no              | Merge new key into mcpServers |
| yes        | yes       | yes             | Overwrite prim key (idempotent) |
| yes        | no        | n/a             | Abort with error message |

### Skill handling

Skills are bundled into the compiled `prim` binary (Bun compiles TS). At install time:

- **Claude Code**: Print the skill path and suggest adding to `.claude/CLAUDE.md` or custom instructions. No standard skill directory exists — Claude Code loads skills from CLAUDE.md or explicit context.
- **Cursor**: Print the skill content or suggest adding to `.cursorrules`. Same — no standard skill drop directory.
- **Generic**: Print the skill content to stdout along with the MCP config.

The skill file content is embedded in the install-commands module as a constant string per primitive (extracted from `skills/*.md` at build time or read from a known path). For the compiled binary, embed the skill content. For dev mode, read from `skills/` relative to the package.

### Uninstall

`prim uninstall store` removes the `prim-store` key from the detected mcp.json. `prim uninstall all` removes all `prim*` keys. Does NOT delete skill files (they may have been modified).

---

## Files to modify

### New file: `packages/keystore/src/install-commands.ts`

The core module. Exports `runInstallCommand(subcommand, argv)` and `runUninstallCommand(subcommand, argv)`.

**Responsibilities:**
- Parse primitive name from argv (or "all" if missing/explicit)
- Validate primitive name against `VALID_PRIMITIVES` list
- Detect agent environment (or use `--agent` override)
- Generate MCP config JSON
- Read, merge, write agent config file
- Print skill instructions
- Print success message with restart hint

**Functions to define (signatures only):**
- `detectAgent(argv): "claude" | "cursor" | "generic"` — environment detection
- `generateMcpConfig(primitives: string[]): object` — builds the mcpServers entry
- `mergeIntoConfigFile(configPath: string, mcpConfig: object): void` — read-merge-write
- `printSkillInstructions(primitive: string, agent: string): void` — guidance per agent type
- `removeFromConfigFile(configPath: string, primitives: string[]): void` — uninstall

**Imports from existing modules:**
- `getFlag`, `hasFlag` from `./flags.ts`
- `getDefaultAddress` from `./config.ts` (wallet check)
- `existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync` from `node:fs`
- `homedir` from `node:os`
- `join`, `dirname` from `node:path`

### Modify: `packages/keystore/src/cli.ts`

Add two new command groups before the "wallet" fallthrough:

```
if (group === "install") → dispatch to runInstallCommand(subcommand, argv)
if (group === "uninstall") → dispatch to runUninstallCommand(subcommand, argv)
```

Follow the exact same dynamic-import + try/catch pattern used by store, spawn, email, etc.

Update the usage string to include:
```
prim install   <primitive|all> [--agent claude|cursor|generic]
prim uninstall <primitive|all>
```

### Modify: `packages/keystore/src/paths.ts`

Add one new function:
- `getSkillsDir(): string` — returns the path to bundled skills (for dev: relative to package root; for compiled binary: embedded asset path or `__dirname` based)

---

## Primitive registry (hardcoded)

```ts
const PRIMITIVES = ["wallet", "store", "spawn", "faucet", "search"] as const;
```

Each primitive's MCP config is deterministic — no need for a manifest file:

| Primitive | MCP server key | args |
|-----------|---------------|------|
| wallet | prim-wallet | `["mcp", "--primitives", "wallet"]` |
| store | prim-store | `["mcp", "--primitives", "store"]` |
| spawn | prim-spawn | `["mcp", "--primitives", "spawn"]` |
| faucet | prim-faucet | `["mcp", "--primitives", "faucet"]` |
| search | prim-search | `["mcp", "--primitives", "search"]` |
| (all) | prim | `["mcp"]` |

---

## CLI UX

### `prim install store`

```
Detected: Claude Code (~/.claude/mcp.json)

✓ Added prim-store to ~/.claude/mcp.json

Skill: store.prim.sh
  To load the store skill, add this to your agent's instructions:
  skills/store.md (or paste the content from `prim skill store`)

Restart Claude Code to load the MCP server.
```

### `prim install all`

```
Detected: Claude Code (~/.claude/mcp.json)

✓ Added prim (all primitives) to ~/.claude/mcp.json

Skills: wallet, store, spawn, faucet, search
  To load skills, add them to your agent's instructions.
  Run `prim skill <name>` to print any skill.

Restart Claude Code to load the MCP server.
```

### `prim install store --agent generic`

Outputs only JSON to stdout (machine-readable):

```json
{
  "mcpServers": {
    "prim-store": {
      "command": "prim",
      "args": ["mcp", "--primitives", "store"]
    }
  }
}
```

### `prim uninstall store`

```
Removed prim-store from ~/.claude/mcp.json
Restart Claude Code to unload the MCP server.
```

### Bonus: `prim skill store`

Print the skill markdown to stdout. Useful for piping or pasting. This is a simple read-and-print — no install logic.

---

## Wallet check

Before install, check if a default wallet is configured:

```
wallet_exists = getDefaultAddress() !== null
```

| wallet_exists | Behavior |
|--------------|----------|
| true | Proceed with install |
| false | Print warning: "No wallet configured. Run `prim wallet create` first. MCP tools that require payment will fail without a wallet." Proceed anyway — the MCP server handles missing wallet gracefully (L-64 already implemented graceful error). |

Do NOT block install on wallet existence. The user may want to set up the MCP connection first and create the wallet later.

---

## Dependencies between primitives

Some primitives require wallet (all except faucet). The skill frontmatter already declares `requires: [wallet]`. The install command should:

1. When installing a primitive that requires wallet, check if `prim-wallet` is already in the agent's config
2. If not, print: "Note: store requires wallet. Run `prim install wallet` to add wallet tools too, or `prim install all` for everything."

This is advisory only — don't auto-install dependencies.

---

## Testing

### Assertions

1. `prim install store --agent generic` outputs valid JSON with exactly `{"mcpServers":{"prim-store":{"command":"prim","args":["mcp","--primitives","store"]}}}`

2. `prim install all --agent generic` outputs valid JSON with exactly `{"mcpServers":{"prim":{"command":"prim","args":["mcp"]}}}`

3. Given an existing mcp.json with `{"mcpServers":{"other-tool":{"command":"x"}}}`, after `prim install store`, the file contains both `other-tool` and `prim-store` keys — `other-tool` is NOT removed.

4. Running `prim install store` twice is idempotent — the second run overwrites `prim-store` without duplicating it.

5. `prim uninstall store` removes `prim-store` but leaves other keys intact.

6. `prim install store` with a corrupt (non-JSON) mcp.json prints an error and does NOT overwrite the file.

7. `prim install bogus` prints error: `Unknown primitive: bogus. Valid: wallet, store, spawn, faucet, search, all`

8. `prim skill store` outputs the store skill markdown to stdout (contains `---\nname: store`).

### Test file

`packages/keystore/test/install-commands.test.ts`

Use vitest. Mock the filesystem (`fs.existsSync`, `fs.readFileSync`, `fs.writeFileSync`) and `os.homedir()`. Test the merge logic, detection logic, and error paths.

---

## Before closing

- [ ] Run `pnpm check` (lint + typecheck + tests pass)
- [ ] Re-read each AC and locate the line of code that enforces it
- [ ] For every boolean condition, verify both True and False paths are covered by tests
- [ ] Verify `prim install` with no args defaults to `all`
- [ ] Verify `--agent` flag overrides auto-detection in all cases
- [ ] Verify corrupt mcp.json is never overwritten
- [ ] Verify uninstall only removes prim-prefixed keys
- [ ] Verify `prim install` works when mcp.json doesn't exist yet (creates it)
