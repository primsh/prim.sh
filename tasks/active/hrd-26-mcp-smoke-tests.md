# HRD-26: MCP Package Smoke Tests

## Context

`packages/mcp/` has 14 source files and zero tests. It's the MCP (Model Context Protocol) server that exposes all Prim primitives as MCP tools over stdio. Unlike the Hono API prims, there's no HTTP layer — the server uses `@modelcontextprotocol/sdk` with `StdioServerTransport`.

## Architecture

```
src/
├── index.ts          # CLI entry — flag parsing (--primitives, --wallet, --help)
├── server.ts         # Factory: startMcpServer(options) → Server instance
├── x402.ts           # Wallet resolution + createMcpFetch()
└── tools/
    ├── wallet.ts     # 16 tools + handleWalletTool()
    ├── store.ts      # 12 tools + handleStoreTool()
    ├── spawn.ts      # 12 tools + handleSpawnTool()
    ├── faucet.ts     # 3 tools + handleFaucetTool()
    ├── email.ts      # Email tools + handler
    ├── search.ts     # Search tools + handler
    ├── mem.ts        # Mem tools + handler
    ├── domain.ts     # Domain tools + handler
    ├── token.ts      # Token tools + handler
    └── report.ts     # 1 meta tool: prim_report()
```

Key exports:
- `startMcpServer(options)` from `server.ts` — creates MCP `Server`, registers `ListToolsRequestSchema` and `CallToolRequestSchema` handlers, connects `StdioServerTransport`
- `isPrimitive(name)` type guard from `server.ts`
- Each `tools/<name>.ts` exports `<name>Tools: Tool[]` and `handle<Name>Tool(name, args, primFetch, baseUrl)`

## 5-Check Contract (MCP equivalent)

The Hono 5-check pattern doesn't map directly. MCP equivalent:

| # | Check | What it validates |
|---|-------|-------------------|
| 1 | `startMcpServer` export is defined | Package entry point works |
| 2 | `isPrimitive()` type guard returns correct results | Primitive filtering logic |
| 3 | Tool list includes expected primitives when filtered | `--primitives` flag wiring |
| 4 | Tool handler dispatches correctly + returns valid `CallToolResult` shape | Happy path |
| 5 | Tool handler returns `isError: true` on fetch failure | Error path |

## Test file

Create `packages/mcp/test/smoke.test.ts`.

### Mocks needed

```
vi.mock("@primsh/keystore") → getConfig() returns { wallet: "0x..." }
vi.mock("@primsh/x402-client") → createPrimFetch() returns mocked fetch
```

Mock `StdioServerTransport` to prevent actual stdio binding — the server factory calls `server.connect(transport)` which would block. Either:
- Mock `@modelcontextprotocol/sdk/server/stdio.js` to return a no-op transport
- Or test the tool arrays and handlers directly without starting the server

Recommended: test tool arrays + handlers directly. The MCP SDK wiring is the SDK's responsibility, not ours.

### Check 1: startMcpServer export defined

```
import { startMcpServer } from "../src/server.ts"
expect(startMcpServer).toBeDefined()
expect(typeof startMcpServer).toBe("function")
```

### Check 2: isPrimitive type guard

```
import { isPrimitive } from "../src/server.ts"
expect(isPrimitive("wallet")).toBe(true)
expect(isPrimitive("faucet")).toBe(true)
expect(isPrimitive("notreal")).toBe(false)
```

### Check 3: Tool arrays include expected tools

```
import { walletTools } from "../src/tools/wallet.ts"
import { faucetTools } from "../src/tools/faucet.ts"

expect(walletTools.length).toBeGreaterThan(0)
expect(walletTools[0]).toHaveProperty("name")
expect(walletTools[0]).toHaveProperty("description")
expect(walletTools[0]).toHaveProperty("inputSchema")

// Verify known tool exists
expect(walletTools.some(t => t.name === "wallet_list")).toBe(true)
expect(faucetTools.some(t => t.name === "faucet_request")).toBe(true)
```

### Check 4: Happy path — handler returns valid CallToolResult

```
import { handleWalletTool } from "../src/tools/wallet.ts"

const mockFetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ wallets: [] }), { status: 200 })
)

const result = await handleWalletTool(
  "wallet_list", {}, mockFetch, "https://wallet.prim.sh"
)

expect(result).toHaveProperty("content")
expect(Array.isArray(result.content)).toBe(true)
expect(result.content[0]).toHaveProperty("type", "text")
expect(result.isError).toBeFalsy()
```

### Check 5: Error path — handler returns isError on failure

```
const mockFetch = vi.fn().mockResolvedValue(
  new Response("Not Found", { status: 404 })
)

const result = await handleWalletTool(
  "wallet_list", {}, mockFetch, "https://wallet.prim.sh"
)

expect(result.isError).toBe(true)
```

## Files created

| File | Change |
|------|--------|
| `packages/mcp/test/smoke.test.ts` | NEW — 5-check smoke test |

## Before closing

- [ ] `pnpm --filter @primsh/mcp test` passes
- [ ] All 5 checks assert the correct thing (re-read each assertion)
- [ ] No real network calls — all fetch is mocked
- [ ] `pnpm -r check` passes (lint + typecheck + test)
