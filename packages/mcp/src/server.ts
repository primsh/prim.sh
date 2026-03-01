// SPDX-License-Identifier: Apache-2.0
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { domainTools, handleDomainTool } from "./tools/domain.js";
import { emailTools, handleEmailTool } from "./tools/email.js";
import { faucetTools, handleFaucetTool } from "./tools/faucet.js";
import { handleMemTool, memTools } from "./tools/mem.js";
import { handleReportTool, reportTools } from "./tools/report.js";
import { handleSearchTool, searchTools } from "./tools/search.js";
import { handleSpawnTool, spawnTools } from "./tools/spawn.js";
import { handleStoreTool, storeTools } from "./tools/store.js";
import { handleTokenTool, tokenTools } from "./tools/token.js";
import { handleWalletTool, walletTools } from "./tools/wallet.js";
import { createMcpFetch, getBaseUrl } from "./x402.js";

const PRIMITIVE_GROUPS = [
  "wallet",
  "store",
  "spawn",
  "faucet",
  "search",
  "email",
  "mem",
  "domain",
  "token",
] as const;
type Primitive = (typeof PRIMITIVE_GROUPS)[number];

function isPrimitive(s: string): s is Primitive {
  return (PRIMITIVE_GROUPS as readonly string[]).includes(s);
}

export interface ServerOptions {
  primitives?: Primitive[];
  walletAddress?: string;
}

function filterTools(
  tools: import("@modelcontextprotocol/sdk/types.js").Tool[],
  prefix: Primitive,
  enabledPrimitives: Primitive[],
) {
  if (!enabledPrimitives.includes(prefix)) return [];
  return tools;
}

export async function startMcpServer(options: ServerOptions = {}): Promise<void> {
  const enabledPrimitives: Primitive[] =
    options.primitives && options.primitives.length > 0
      ? options.primitives
      : [...PRIMITIVE_GROUPS];

  // Eagerly create primFetch (will throw if no wallet configured and wallet-using tools are requested)
  let primFetch: typeof fetch;
  const needsWallet = enabledPrimitives.some((p) => p !== "faucet");

  if (needsWallet) {
    try {
      primFetch = await createMcpFetch(options.walletAddress);
    } catch (err) {
      process.stderr.write(
        `Error: Could not load wallet for x402 payment: ${err instanceof Error ? err.message : String(err)}\nSet PRIM_WALLET env var or use --wallet 0x... to specify a wallet address.\n`,
      );
      process.exit(1);
    }
  } else {
    // Faucet-only: no wallet needed
    primFetch = fetch;
  }

  const allTools = [
    ...filterTools(walletTools, "wallet", enabledPrimitives),
    ...filterTools(storeTools, "store", enabledPrimitives),
    ...filterTools(spawnTools, "spawn", enabledPrimitives),
    ...filterTools(faucetTools, "faucet", enabledPrimitives),
    ...filterTools(searchTools, "search", enabledPrimitives),
    ...filterTools(emailTools, "email", enabledPrimitives),
    ...filterTools(memTools, "mem", enabledPrimitives),
    ...filterTools(domainTools, "domain", enabledPrimitives),
    ...filterTools(tokenTools, "token", enabledPrimitives),
    ...reportTools,
  ];

  const server = new Server({ name: "prim", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const toolArgs = (args ?? {}) as Record<string, unknown>;

    if (name.startsWith("wallet_") && enabledPrimitives.includes("wallet")) {
      return handleWalletTool(name, toolArgs, primFetch, getBaseUrl("wallet"));
    }
    if (name.startsWith("store_") && enabledPrimitives.includes("store")) {
      return handleStoreTool(name, toolArgs, primFetch, getBaseUrl("store"));
    }
    if (name.startsWith("spawn_") && enabledPrimitives.includes("spawn")) {
      return handleSpawnTool(name, toolArgs, primFetch, getBaseUrl("spawn"));
    }
    if (name.startsWith("faucet_") && enabledPrimitives.includes("faucet")) {
      return handleFaucetTool(name, toolArgs, getBaseUrl("faucet"));
    }
    if (name.startsWith("search_") && enabledPrimitives.includes("search")) {
      return handleSearchTool(name, toolArgs, primFetch, getBaseUrl("search"));
    }
    if (name.startsWith("email_") && enabledPrimitives.includes("email")) {
      return handleEmailTool(name, toolArgs, primFetch, getBaseUrl("email"));
    }
    if (name.startsWith("mem_") && enabledPrimitives.includes("mem")) {
      return handleMemTool(name, toolArgs, primFetch, getBaseUrl("mem"));
    }
    if (name.startsWith("domain_") && enabledPrimitives.includes("domain")) {
      return handleDomainTool(name, toolArgs, primFetch, getBaseUrl("domain"));
    }
    if (name.startsWith("token_") && enabledPrimitives.includes("token")) {
      return handleTokenTool(name, toolArgs, primFetch, getBaseUrl("token"));
    }
    if (name === "prim_report") {
      return handleReportTool(name, toolArgs);
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`prim MCP server started. Primitives: ${enabledPrimitives.join(", ")}\n`);
}

export { isPrimitive };
export type { Primitive };
