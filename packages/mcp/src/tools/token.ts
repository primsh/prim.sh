import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const tokenTools: Tool[] = [
  {
    name: "token_deploy",
    description:
      "Deploy a new ERC-20 token contract to Base. Returns immediately with deployStatus: 'pending' — poll token_get until deployStatus is 'confirmed' before minting or creating a pool.",
    inputSchema: {
      type: "object",
      required: ["name", "symbol", "initialSupply"],
      properties: {
        name: {
          type: "string",
          description: "Token name (e.g. 'MyToken').",
        },
        symbol: {
          type: "string",
          description: "Token ticker symbol, typically 3-5 uppercase characters (e.g. 'MTK').",
        },
        initialSupply: {
          type: "string",
          description:
            "Initial supply in raw token units. For 1M tokens with 18 decimals, pass '1000000000000000000000000'.",
        },
        decimals: {
          type: "integer",
          description: "Number of decimal places (default 18). Most ERC-20 tokens use 18.",
          default: 18,
        },
        mintable: {
          type: "boolean",
          description: "Whether additional tokens can be minted after deploy (default false).",
          default: false,
        },
        maxSupply: {
          type: ["string", "null"],
          description:
            "Maximum mintable supply in raw units. null or omit for no cap. Only meaningful if mintable is true.",
        },
      },
    },
  },
  {
    name: "token_list",
    description: "List all ERC-20 tokens deployed by the authenticated wallet.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "token_get",
    description:
      "Get details for a single token including deployStatus, contractAddress, supply, and pool info. Poll until deployStatus is 'confirmed' before performing token operations.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Token ID (UUID).",
        },
      },
    },
  },
  {
    name: "token_mint",
    description:
      "Mint additional tokens to a recipient address. The token must be mintable and the mint must not exceed maxSupply. Caller must own the token.",
    inputSchema: {
      type: "object",
      required: ["id", "to", "amount"],
      properties: {
        id: {
          type: "string",
          description: "Token ID (UUID).",
        },
        to: {
          type: "string",
          description: "Recipient Ethereum address (0x...).",
        },
        amount: {
          type: "string",
          description: "Amount to mint in raw token units.",
        },
      },
    },
  },
  {
    name: "token_supply",
    description:
      "Get the live on-chain total supply for a token by querying the contract directly.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Token ID (UUID).",
        },
      },
    },
  },
  {
    name: "token_pool_create",
    description:
      "Create and initialize a Uniswap V3 pool for the token paired with USDC. Only one pool can exist per token. After creating, call token_pool_liquidity_params to get calldata for adding liquidity.",
    inputSchema: {
      type: "object",
      required: ["id", "pricePerToken"],
      properties: {
        id: {
          type: "string",
          description: "Token ID (UUID).",
        },
        pricePerToken: {
          type: "string",
          description:
            "Initial price in USDC per token (e.g. '0.001' for 0.1 cents per token).",
        },
        feeTier: {
          type: "integer",
          description:
            "Uniswap V3 fee tier. Valid values: 500 (0.05%), 3000 (0.3%), 10000 (1%). Default 3000.",
          enum: [500, 3000, 10000],
          default: 3000,
        },
      },
    },
  },
  {
    name: "token_pool_get",
    description:
      "Get details for the Uniswap V3 pool associated with a token (poolAddress, token0, token1, fee, sqrtPriceX96, tick).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Token ID (UUID).",
        },
      },
    },
  },
  {
    name: "token_pool_liquidity_params",
    description:
      "Get the calldata parameters for adding liquidity to a token's Uniswap V3 pool, including required token approvals to submit before calling addLiquidity.",
    inputSchema: {
      type: "object",
      required: ["id", "tokenAmount", "usdcAmount"],
      properties: {
        id: {
          type: "string",
          description: "Token ID (UUID).",
        },
        tokenAmount: {
          type: "string",
          description: "Amount of tokens to add as liquidity in raw units.",
        },
        usdcAmount: {
          type: "string",
          description:
            "Amount of USDC to add as liquidity in raw units (USDC has 6 decimals, so $1 = '1000000').",
        },
      },
    },
  },
];

export async function handleTokenTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "token_deploy": {
        const body: Record<string, unknown> = {
          name: args.name,
          symbol: args.symbol,
          initialSupply: args.initialSupply,
        };
        if (args.decimals !== undefined) body.decimals = args.decimals;
        if (args.mintable !== undefined) body.mintable = args.mintable;
        if (args.maxSupply !== undefined) body.maxSupply = args.maxSupply;
        const res = await primFetch(`${baseUrl}/v1/tokens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_list": {
        const res = await primFetch(`${baseUrl}/v1/tokens`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_get": {
        const res = await primFetch(`${baseUrl}/v1/tokens/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_mint": {
        const res = await primFetch(`${baseUrl}/v1/tokens/${args.id}/mint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: args.to, amount: args.amount }),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_supply": {
        const res = await primFetch(`${baseUrl}/v1/tokens/${args.id}/supply`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_pool_create": {
        const body: Record<string, unknown> = { pricePerToken: args.pricePerToken };
        if (args.feeTier !== undefined) body.feeTier = args.feeTier;
        const res = await primFetch(`${baseUrl}/v1/tokens/${args.id}/pool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_pool_get": {
        const res = await primFetch(`${baseUrl}/v1/tokens/${args.id}/pool`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "token_pool_liquidity_params": {
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
