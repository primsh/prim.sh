import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const walletTools: Tool[] = [
  {
    name: "wallet_list_wallets",
    description: "List registered wallets | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of wallets to return (1–100, default 20)",
        },
        after: {
          type: "string",
          description: "Cursor from a previous response for pagination",
        },
      },
    },
  },
  {
    name: "wallet_register_wallet",
    description: "Register a wallet",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Ethereum wallet address to register",
        },
        signature: {
          type: "string",
          description: "EIP-191 signature over the registration message",
        },
        timestamp: {
          type: "string",
          format: "date-time",
          description:
            "ISO 8601 UTC timestamp used in the signed message (must be within 5 min of now)",
        },
        chain: {
          type: "string",
          description: 'Chain identifier. Defaults to "base".',
        },
        label: {
          type: "string",
          description: "Optional human-readable label for this wallet",
        },
      },
      required: ["address", "signature", "timestamp"],
    },
  },
  {
    name: "wallet_get_wallet",
    description: "Get wallet details | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "wallet_deactivate_wallet",
    description: "Deactivate a wallet | Price: $0.01",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "wallet_create_fund_request",
    description: "Create a fund request | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
        },
        amount: {
          type: "string",
          description: 'Requested USDC amount as a decimal string (e.g. "10.00")',
        },
        reason: {
          type: "string",
          description: "Human-readable reason for the funding request",
        },
      },
      required: ["address", "amount", "reason"],
    },
  },
  {
    name: "wallet_list_fund_requests",
    description: "List fund requests for a wallet | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of requests to return (1–100, default 20)",
        },
        after: {
          type: "string",
          description: "Cursor from a previous response for pagination",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "wallet_approve_fund_request",
    description: "Approve a fund request | Price: $0.01",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "wallet_deny_fund_request",
    description: "Deny a fund request | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
        },
        reason: {
          type: "string",
          description: "Optional reason for denying the request",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "wallet_get_policy",
    description: "Get spending policy | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "wallet_update_policy",
    description: "Update spending policy | Price: $0.005",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
        },
        maxPerTx: {
          type: ["string", "null"],
          description: "Maximum USDC per transaction. Pass null to remove the limit.",
        },
        maxPerDay: {
          type: ["string", "null"],
          description: "Maximum USDC per day. Pass null to remove the limit.",
        },
        allowedPrimitives: {
          type: ["array", "null"],
          items: {
            type: "string",
          },
          description: "Allowed primitive hostnames. Pass null to allow all.",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "wallet_pause_wallet",
    description: "Pause a wallet | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
        },
        scope: {
          type: "string",
          enum: ["all", "send", "swap"],
          default: "all",
          description: "Which operations to pause",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "wallet_resume_wallet",
    description: "Resume a paused wallet | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
        },
        scope: {
          type: "string",
          enum: ["all", "send", "swap"],
          default: "all",
          description: "Which operations to resume",
        },
      },
      required: ["address"],
    },
  },
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleWalletTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "wallet_list_wallets": {
        const url = new URL(`${baseUrl}/v1/wallets`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.after !== undefined) url.searchParams.set("after", String(args.after));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_register_wallet": {
        const res = await primFetch(`${baseUrl}/v1/wallets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_get_wallet": {
        const res = await primFetch(`${baseUrl}/v1/wallets/${args.address}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_deactivate_wallet": {
        const res = await primFetch(`${baseUrl}/v1/wallets/${args.address}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_create_fund_request": {
        const { address, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/wallets/${args.address}/fund-request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_list_fund_requests": {
        const url = new URL(`${baseUrl}/v1/wallets/${args.address}/fund-requests`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.after !== undefined) url.searchParams.set("after", String(args.after));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_approve_fund_request": {
        const res = await primFetch(`${baseUrl}/v1/fund-requests/${args.id}/approve`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_deny_fund_request": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/fund-requests/${args.id}/deny`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_get_policy": {
        const res = await primFetch(`${baseUrl}/v1/wallets/${args.address}/policy`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_update_policy": {
        const { address, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/wallets/${args.address}/policy`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_pause_wallet": {
        const { address, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/wallets/${args.address}/pause`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_resume_wallet": {
        const { address, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/wallets/${args.address}/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown wallet tool: ${name}` }],
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
