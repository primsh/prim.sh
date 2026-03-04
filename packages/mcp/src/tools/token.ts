// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/token.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const tokenTools: Tool[] = [
  {
    name: "token_list_tokens",
    description: "List tokens deployed by the authenticated wallet | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
  {
    name: "token_deploy_token",
    description: "Deploy a new ERC-20 token. Returns immediately with deployStatus: 'pending'. | Price: $0.10",
    inputSchema: {
        type: "object",
        properties: {
          "name": {
            type: "string",
            description: "Token name (e.g. \"AgentCoin\").",
          },
          "symbol": {
            type: "string",
            description: "Token symbol (e.g. \"AGT\").",
          },
          "decimals": {
            type: "number",
            description: "Decimal places. Default 18.",
          },
          "initialSupply": {
            type: "string",
            description: "Initial supply as a raw integer string (e.g. \"1000000000000000000\" = 1 token at 18 decimals).",
          },
          "mintable": {
            type: "boolean",
            description: "Whether additional tokens can be minted after deployment. Default false.",
          },
          "maxSupply": {
            type: ["string","null"],
            description: "Maximum mintable supply as a raw integer string. Null = unlimited. Only applies if mintable is true.",
          },
        },
        required: ["name","symbol","initialSupply"],
      },
  },
  {
    name: "token_get_token",
    description: "Get token details: deployStatus, contractAddress, supply, pool | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "token_mint_tokens",
    description: "Mint additional tokens to an address. Requires mintable=true at deploy time. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "to": {
            type: "string",
            description: "Recipient address to mint tokens to.",
          },
          "amount": {
            type: "string",
            description: "Amount to mint as a raw integer string.",
          },
        },
        required: ["id","to","amount"],
      },
  },
  {
    name: "token_get_token_supply",
    description: "Live on-chain total supply from contract | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "token_get_pool",
    description: "Get pool details: poolAddress, token0, token1, fee, sqrtPriceX96, tick | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "token_create_pool",
    description: "Create and initialize a Uniswap V3 pool paired with USDC. One pool per token. | Price: $0.05",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "pricePerToken": {
            type: "string",
            description: "Initial price per token in USDC as a decimal string (e.g. \"0.001\").",
          },
          "feeTier": {
            type: "number",
            description: "Uniswap V3 fee tier. 500 | 3000 | 10000, default 3000.",
          },
        },
        required: ["id","pricePerToken"],
      },
  },
  {
    name: "token_get_liquidity_params",
    description: "Get calldata for adding liquidity. Returns approvals[] and position manager params. | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "tokenAmount": {
            type: "string",
            description: "Raw token amount to add as liquidity",
          },
          "usdcAmount": {
            type: "string",
            description: "Raw USDC amount to pair (6 decimals)",
          },
        },
        required: ["id"],
      },
  },
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleTokenTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "token_list_tokens": {
        const res = await primFetch(`${baseUrl}/v1/tokens`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_deploy_token": {
        const res = await primFetch(`${baseUrl}/v1/tokens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_get_token": {
        const res = await primFetch(`${baseUrl}/v1/tokens/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_mint_tokens": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/tokens/${args.id}/mint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_get_token_supply": {
        const res = await primFetch(`${baseUrl}/v1/tokens/${args.id}/supply`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_get_pool": {
        const res = await primFetch(`${baseUrl}/v1/tokens/${args.id}/pool`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_create_pool": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/tokens/${args.id}/pool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_get_liquidity_params": {
        const url = new URL(`${baseUrl}/v1/tokens/${args.id}/pool/liquidity-params`);
        if (args.tokenAmount !== undefined) url.searchParams.set("tokenAmount", String(args.tokenAmount));
        if (args.usdcAmount !== undefined) url.searchParams.set("usdcAmount", String(args.usdcAmount));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown token tool: ${name}` }],
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
