// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/faucet.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const faucetTools: Tool[] = [
  {
    name: "faucet_drip_usdc",
    description: "Dispense 10 test USDC on Base Sepolia. Rate limit: once per 2 hours per address.",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "EVM wallet address to drip to (0x... 42 chars).",
          },
        },
        required: ["address"],
      },
  },
  {
    name: "faucet_drip_eth",
    description: "Dispense 0.01 test ETH on Base Sepolia. Rate limit: once per 1 hour per address.",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "EVM wallet address to drip to (0x... 42 chars).",
          },
        },
        required: ["address"],
      },
  },
  {
    name: "faucet_get_faucet_status",
    description: "Check rate limit status for a wallet address across both faucets.",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "EVM wallet address (required)",
          },
        },
      },
  },
  {
    name: "faucet_get_treasury_status",
    description: "Check treasury wallet ETH balance and refill status.",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
  {
    name: "faucet_refill_treasury",
    description: "Batch-claim testnet ETH from Coinbase CDP faucet into treasury. Rate limited to once per 10 minutes.",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleFaucetTool(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "faucet_drip_usdc": {
        const res = await fetch(`${baseUrl}/v1/faucet/usdc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "faucet_drip_eth": {
        const res = await fetch(`${baseUrl}/v1/faucet/eth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "faucet_get_faucet_status": {
        const url = new URL(`${baseUrl}/v1/faucet/status`);
        if (args.address !== undefined) url.searchParams.set("address", String(args.address));
        const res = await fetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "faucet_get_treasury_status": {
        const res = await fetch(`${baseUrl}/v1/faucet/treasury`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "faucet_refill_treasury": {
        const res = await fetch(`${baseUrl}/v1/faucet/refill`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown faucet tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [
        { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ],
      isError: true,
    };
  }
}

function errorResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    isError: true,
  };
}
// END:GENERATED:HANDLER
