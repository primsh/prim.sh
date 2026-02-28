import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const faucetTools: Tool[] = [
  {
    name: "faucet_drip_usdc",
    description: "Dispense test USDC",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "EVM-compatible wallet address (42-char hex, checksummed or lowercase)",
          pattern: "^0x[0-9a-fA-F]{40}$",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "faucet_drip_eth",
    description: "Dispense test ETH",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "EVM-compatible wallet address (42-char hex, checksummed or lowercase)",
          pattern: "^0x[0-9a-fA-F]{40}$",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "faucet_get_faucet_status",
    description: "Check rate limit status",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "EVM wallet address (checksummed or lowercase)",
          pattern: "^0x[0-9a-fA-F]{40}$",
        },
      },
      required: ["address"],
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
        url.searchParams.set("address", String(args.address));
        const res = await fetch(url.toString());
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
