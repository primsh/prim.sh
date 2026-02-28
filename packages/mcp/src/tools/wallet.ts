// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/wallet.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const walletTools: Tool[] = [
  {
    name: "wallet_list_wallets",
    description: "List registered wallets owned by the calling wallet | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "limit": {
            type: "integer",
            description: "1-100, default 20",
          },
          "after": {
            type: "string",
            description: "Cursor from previous response",
          },
        },
      },
  },
  {
    name: "wallet_register_wallet",
    description: "Register a wallet via EIP-191 signature",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "Ethereum address to register (0x... 42 chars, checksummed).",
          },
          "signature": {
            type: "string",
            description: "EIP-191 signature over \"Register <address> with prim.sh at <timestamp>\".",
          },
          "timestamp": {
            type: "string",
            description: "ISO 8601 UTC timestamp used in the signed message. Must be within 5 minutes of server time.",
          },
          "chain": {
            type: "string",
            description: "Chain identifier. Default \"base\".",
          },
          "label": {
            type: "string",
            description: "Human-readable label for this wallet.",
          },
        },
        required: ["address","signature","timestamp"],
      },
  },
  {
    name: "wallet_get_wallet",
    description: "Get full wallet details including balance, policy, and status | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "address parameter",
          },
        },
        required: ["address"],
      },
  },
  {
    name: "wallet_deactivate_wallet",
    description: "Permanently deactivate a wallet. Irreversible. Pending fund requests cancelled. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "address parameter",
          },
        },
        required: ["address"],
      },
  },
  {
    name: "wallet_create_fund_request",
    description: "Request USDC funding for a wallet. A human operator can approve or deny. | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "address parameter",
          },
          "amount": {
            type: "string",
            description: "Requested USDC amount as a decimal string (e.g. \"10.00\").",
          },
          "reason": {
            type: "string",
            description: "Human-readable reason for the funding request.",
          },
        },
        required: ["address","amount","reason"],
      },
  },
  {
    name: "wallet_list_fund_requests",
    description: "List all fund requests for a wallet | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "address parameter",
          },
          "limit": {
            type: "integer",
            description: "1-100, default 20",
          },
          "after": {
            type: "string",
            description: "Cursor from previous response",
          },
        },
        required: ["address"],
      },
  },
  {
    name: "wallet_approve_fund_request",
    description: "Approve a pending fund request. Returns the address to send USDC to. | Price: $0.01",
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
    name: "wallet_deny_fund_request",
    description: "Deny a pending fund request | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "reason": {
            type: "string",
            description: "Reason for denial.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "wallet_get_policy",
    description: "Get the spending policy for a wallet | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "address parameter",
          },
        },
        required: ["address"],
      },
  },
  {
    name: "wallet_update_policy",
    description: "Update spending policy for a wallet. All fields optional. Pass null to remove a limit. | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "address parameter",
          },
          "maxPerTx": {
            type: ["string","null"],
            description: "Max USDC per transaction. Pass null to remove the limit.",
          },
          "maxPerDay": {
            type: ["string","null"],
            description: "Max USDC per day. Pass null to remove the limit.",
          },
          "allowedPrimitives": {
            type: ["array","null"],
            description: "Allowed primitive hostnames. Pass null to allow all.",
          },
        },
        required: ["address"],
      },
  },
  {
    name: "wallet_pause_wallet",
    description: "Pause operations for a wallet. Temporarily halts spending without deactivating. | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "address parameter",
          },
          "scope": {
            type: "string",
            description: "Scope to pause. \"all\" | \"send\" | \"swap\". Default \"all\".",
          },
        },
        required: ["address"],
      },
  },
  {
    name: "wallet_resume_wallet",
    description: "Resume operations for a paused wallet | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "address": {
            type: "string",
            description: "address parameter",
          },
          "scope": {
            type: "string",
            description: "Scope to resume. \"all\" | \"send\" | \"swap\". Default \"all\".",
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
        const res = await primFetch(`${baseUrl}/v1/fund-requests/${args.id}/approve`, { method: "POST" });
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
