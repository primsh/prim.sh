// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/token.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const tokenTools: Tool[] = [
  {
    name: "token_list_tokens",
    description: "List tokens | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "limit": {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
            description: "Number of tokens per page (1–100, default 20).",
          },
          "page": {
            type: "integer",
            minimum: 1,
            default: 1,
            description: "Page number (1-based, default 1).",
          },
        },
      },
  },
  {
    name: "token_deploy_token",
    description: "Deploy ERC-20 token | Price: $1.00",
    inputSchema: {
        type: "object",
        properties: {
          "name": {
            type: "string",
            minLength: 1,
            maxLength: 64,
            description: "Token name.",
          },
          "symbol": {
            type: "string",
            minLength: 1,
            maxLength: 11,
            pattern: "^[A-Z0-9]+$",
            description: "Token ticker symbol (uppercase alphanumeric, 1–11 chars).",
          },
          "decimals": {
            type: "integer",
            minimum: 0,
            maximum: 18,
            description: "Decimal places (default 18). Most ERC-20 tokens use 18.",
            default: 18,
          },
          "initialSupply": {
            type: "string",
            description: "Initial supply in raw token units. For 1M tokens with 18 decimals, pass \"1000000000000000000000000\".",
          },
          "mintable": {
            type: "boolean",
            description: "Whether additional tokens can be minted after deploy (default false). Immutable after deployment.",
            default: false,
          },
          "maxSupply": {
            type: ["string","null"],
            description: "Maximum mintable supply in raw units. null or omit for no cap. Only meaningful if mintable is true.",
          },
        },
        required: ["name","symbol","initialSupply"],
      },
  },
  {
    name: "token_get_token",
    description: "Get token details | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Token ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "token_mint_tokens",
    description: "Mint additional tokens | Price: $0.10",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Token ID.",
          },
          "to": {
            type: "string",
            pattern: "^0x[a-fA-F0-9]{40}$",
            description: "Recipient Ethereum address.",
          },
          "amount": {
            type: "string",
            description: "Amount to mint in raw token units.",
          },
        },
        required: ["id","to","amount"],
      },
  },
  {
    name: "token_get_token_supply",
    description: "Get total supply | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Token ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "token_get_pool",
    description: "Get pool details | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Token ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "token_create_pool",
    description: "Create Uniswap V3 pool | Price: $0.50",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Token ID.",
          },
          "pricePerToken": {
            type: "string",
            description: "Initial price in USDC per token as a decimal string (e.g. \"0.001\" for 0.1 cents per token).",
          },
          "feeTier": {
            type: "integer",
            description: "Uniswap V3 fee tier in hundredths of a basis point. Valid values are 500 (0.05%), 3000 (0.3%), 10000 (1%). Default 3000.",
            enum: [500,3000,10000],
            default: 3000,
          },
        },
        required: ["id","pricePerToken"],
      },
  },
  {
    name: "token_get_liquidity_params",
    description: "Get liquidity parameters | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Token ID.",
          },
          "tokenAmount": {
            type: "string",
            description: "Amount of tokens to add as liquidity in raw units.",
          },
          "usdcAmount": {
            type: "string",
            description: "Amount of USDC to add as liquidity in raw units (USDC has 6 decimals, so $1 = \"1000000\").",
          },
        },
        required: ["id","tokenAmount","usdcAmount"],
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
        const url = new URL(`${baseUrl}/v1/tokens`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.page !== undefined) url.searchParams.set("page", String(args.page));
        const res = await primFetch(url.toString());
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
        url.searchParams.set("tokenAmount", String(args.tokenAmount));
        url.searchParams.set("usdcAmount", String(args.usdcAmount));
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
