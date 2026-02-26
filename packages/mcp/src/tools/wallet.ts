import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const walletTools: Tool[] = [
  {
    name: "wallet_register",
    description:
      "Register an Ethereum wallet address with wallet.prim.sh via EIP-191 signature. No payment required. The wallet must be registered before it can pay for prim primitives.",
    inputSchema: {
      type: "object",
      required: ["address", "signature", "timestamp"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Ethereum wallet address to register.",
        },
        signature: {
          type: "string",
          description:
            "EIP-191 signature of 'Register {address} with prim.sh at {timestamp}'.",
        },
        timestamp: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 timestamp used in the signed message.",
        },
      },
    },
  },
  {
    name: "wallet_list",
    description:
      "List all wallets registered by the authenticated wallet. Returns paginated wallet records.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of wallets per page (1-100, default 20).",
        },
        page: {
          type: "integer",
          minimum: 1,
          default: 1,
          description: "Page number (1-based, default 1).",
        },
      },
    },
  },
  {
    name: "wallet_get",
    description:
      "Get details for a single wallet including balance, policy, and status.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Ethereum wallet address to look up.",
        },
      },
    },
  },
  {
    name: "wallet_deactivate",
    description:
      "Deactivate a wallet permanently. This cannot be undone. The wallet will no longer be able to pay for prim services.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Ethereum wallet address to deactivate.",
        },
      },
    },
  },
  {
    name: "wallet_fund_request_create",
    description:
      "Create a funding request for a wallet. Use when a wallet needs USDC to pay for prim services. An operator reviews and approves or denies the request.",
    inputSchema: {
      type: "object",
      required: ["address", "amount", "reason"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Wallet address requesting funds.",
        },
        amount: {
          type: "string",
          description: "Requested USDC amount as a decimal string (e.g. '10.00').",
        },
        reason: {
          type: "string",
          description: "Human-readable reason for the funding request.",
        },
      },
    },
  },
  {
    name: "wallet_fund_request_list",
    description:
      "List funding requests for a wallet. Returns all pending, approved, and denied requests.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Wallet address to list fund requests for.",
        },
        status: {
          type: "string",
          enum: ["pending", "approved", "denied"],
          description: "Filter by status. Omit to return all.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of results per page.",
        },
        page: {
          type: "integer",
          minimum: 1,
          default: 1,
          description: "Page number (1-based).",
        },
      },
    },
  },
  {
    name: "wallet_fund_request_approve",
    description:
      "Approve a pending fund request, triggering a USDC transfer to the wallet. Requires operator permissions.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Fund request ID (e.g. 'fr_abc123').",
        },
        note: {
          type: "string",
          description: "Optional note for the approval.",
        },
      },
    },
  },
  {
    name: "wallet_fund_request_deny",
    description:
      "Deny a pending fund request. Requires operator permissions.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Fund request ID (e.g. 'fr_abc123').",
        },
        reason: {
          type: "string",
          description: "Optional reason for the denial.",
        },
      },
    },
  },
  {
    name: "wallet_policy_get",
    description:
      "Get the spending policy for a wallet. Returns maxPerTx, maxPerDay, and current daily spend.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Wallet address to get policy for.",
        },
      },
    },
  },
  {
    name: "wallet_policy_update",
    description:
      "Set or update the spending policy for a wallet. Use null to remove a limit.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Wallet address to update policy for.",
        },
        maxPerTx: {
          type: ["string", "null"],
          description:
            "Maximum USDC per transaction (e.g. '1.00'), or null to remove the limit.",
        },
        maxPerDay: {
          type: ["string", "null"],
          description:
            "Maximum USDC per day (e.g. '10.00'), or null to remove the limit.",
        },
      },
    },
  },
  {
    name: "wallet_pause",
    description:
      "Pause a wallet, preventing it from making payments. Use to temporarily block spending.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Wallet address to pause.",
        },
        reason: {
          type: "string",
          description: "Optional reason for pausing.",
        },
      },
    },
  },
  {
    name: "wallet_resume",
    description:
      "Resume a paused wallet, allowing it to make payments again.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Wallet address to resume.",
        },
      },
    },
  },
];

export async function handleWalletTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "wallet_register": {
        const res = await fetch(`${baseUrl}/v1/wallets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_list": {
        const url = new URL(`${baseUrl}/v1/wallets`);
        if (args.limit) url.searchParams.set("limit", String(args.limit));
        if (args.page) url.searchParams.set("page", String(args.page));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_get": {
        const res = await primFetch(`${baseUrl}/v1/wallets/${args.address}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_deactivate": {
        const res = await primFetch(`${baseUrl}/v1/wallets/${args.address}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_fund_request_create": {
        const { address, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/wallets/${address}/fund-request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_fund_request_list": {
        const { address, ...params } = args;
        const url = new URL(`${baseUrl}/v1/wallets/${address}/fund-requests`);
        if (params.status) url.searchParams.set("status", String(params.status));
        if (params.limit) url.searchParams.set("limit", String(params.limit));
        if (params.page) url.searchParams.set("page", String(params.page));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_fund_request_approve": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/fund-requests/${id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_fund_request_deny": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/fund-requests/${id}/deny`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_policy_get": {
        const res = await primFetch(`${baseUrl}/v1/wallets/${args.address}/policy`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_policy_update": {
        const { address, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/wallets/${address}/policy`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_pause": {
        const { address, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/wallets/${address}/pause`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "wallet_resume": {
        const res = await primFetch(`${baseUrl}/v1/wallets/${args.address}/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown wallet tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
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
