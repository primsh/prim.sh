# I-21: Plugin Install System

**Status:** pending
**Goal:** `prim install <primitive|all>` drops MCP config + skill into the agent's environment. One command, fully wired. An agent goes from zero to using prim primitives with a single install.
**Depends on:** I-12 (MCP generator — plugins bundle MCP server config), I-20 (Skills — plugins bundle skill docs)
**Scope:** `packages/keystore/src/install-commands.ts` (new), `packages/keystore/src/cli.ts`
**Absorbs:** Wave 5.5 L-66

## Context

Today, wiring prim into an agent runtime requires:
1. Knowing where the MCP config file lives (~/.claude/mcp.json, .cursor/mcp.json, etc.)
2. Manually editing it to add the prim MCP server
3. Finding and loading the right skill docs
4. Restarting the agent

`prim install` automates all of this.

## Design

### CLI Usage

```
prim install <primitive|all> [--agent claude|cursor|vscode|generic]
prim uninstall <primitive|all>
prim install --list            # Show what's installed
```

### What "install" does

1. Check `prim` binary is installed and wallet exists (prompt to create if not)
2. Detect agent environment (or use `--agent` flag):
   - Claude Code → `~/.claude/mcp.json`
   - Cursor → `.cursor/mcp.json` (project-level)
   - VS Code → `.vscode/mcp.json`
   - Generic → print JSON to stdout
3. Merge MCP server config into detected config file
4. Copy skill file to agent's context directory (or print path)
5. Print success message with restart instructions

### MCP Config Shape

For `prim install store`:
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

For `prim install all`:
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

### Agent Environment Detection

Detection order:
1. `--agent` flag (explicit)
2. Check for `.cursor/` directory → Cursor
3. Check for `~/.claude/` directory → Claude Code
4. Check for `.vscode/` directory → VS Code
5. Fallback: generic (stdout)

### Primitive Registry

The install command needs to know which primitives exist and their metadata. Read from `packages/*/prim.yaml` (deployed prims only). The registry is implicit — it's the set of prim.yaml files that exist.

### Uninstall

`prim uninstall store`:
1. Read agent's MCP config
2. Remove `prim-store` server entry
3. Write back
4. Print success

`prim uninstall all`:
1. Remove all `prim-*` entries from MCP config
2. Write back

### `prim install --list`

Show installed primitives by reading the agent's MCP config and listing all `prim-*` entries.

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/keystore/src/install-commands.ts` | Create — install/uninstall command handlers |
| `packages/keystore/src/cli.ts` | Modify — add `install` and `uninstall` group dispatch |

## Key Decisions

- **Merge, not overwrite.** When adding MCP config, merge with existing config file. Never clobber other MCP servers the user has configured.
- **`prim install all` creates ONE server entry**, not N entries. The unified MCP server exposes all primitives. Individual install creates filtered servers (`--primitives <id>`).
- **Skill placement is best-effort.** If the agent environment has a known skills/rules directory, copy there. Otherwise, print the path and let the user handle it. Don't fail if skill placement isn't possible.
- **Idempotent.** Running `prim install store` twice is safe — it updates the config entry, doesn't duplicate it.
- **No daemon.** The MCP server is started by the agent runtime when it reads the config. `prim install` just writes config — it doesn't start any processes.

## Testing Strategy

- `prim install store --agent generic` → outputs valid MCP JSON to stdout
- `prim install all --agent generic` → outputs unified MCP JSON
- `prim uninstall store --agent generic` → removes the correct entry
- Mock filesystem tests: verify config merge doesn't clobber existing entries
- Verify idempotency: install twice → config has exactly one entry

## Before Closing

- [ ] `prim install <primitive>` works for all deployed prims
- [ ] `prim install all` creates unified MCP server entry
- [ ] `prim uninstall` cleanly removes entries without affecting others
- [ ] Agent detection works for Claude Code, Cursor, VS Code
- [ ] Generic fallback outputs valid JSON to stdout
- [ ] `prim install --list` shows installed primitives
- [ ] Config merge is safe (doesn't clobber existing MCP servers)
