import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const faucetTools: Tool[] = [
  {
    name: "faucet_usdc",
    description:
      "Dispense 10 test USDC on Base Sepolia to a wallet address. Rate limit: once per 2 hours per address. No x402 payment required — free endpoint.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[0-9a-fA-F]{40}$",
          description: "EVM wallet address to receive test USDC.",
        },
      },
    },
  },
  {
    name: "faucet_eth",
    description:
      "Dispense 0.01 test ETH on Base Sepolia to a wallet address. Rate limit: once per 1 hour per address. No x402 payment required — free endpoint.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[0-9a-fA-F]{40}$",
          description: "EVM wallet address to receive test ETH.",
        },
      },
    },
  },
  {
    name: "faucet_status",
    description:
      "Check the rate limit status for a wallet address across both faucet types (USDC and ETH). Use this before dripping to avoid 429s.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[0-9a-fA-F]{40}$",
          description: "EVM wallet address to check status for.",
        },
      },
    },
  },
];

export async function handleFaucetTool(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "faucet_usdc": {
        const res = await fetch(`${baseUrl}/v1/faucet/usdc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: args.address }),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "faucet_eth": {
        const res = await fetch(`${baseUrl}/v1/faucet/eth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: args.address }),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "faucet_status": {
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
