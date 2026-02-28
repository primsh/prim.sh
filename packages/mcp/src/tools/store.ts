// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/store.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const storeTools: Tool[] = [
  {
    name: "store_list_buckets",
    description: "List buckets | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "limit": {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
            description: "Number of buckets per page (1–100, default 20).",
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
    name: "store_create_bucket",
    description: "Create a bucket | Price: $0.05",
    inputSchema: {
        type: "object",
        properties: {
          "name": {
            type: "string",
            description: "Bucket name. Must be unique per wallet. Alphanumeric, hyphens, underscores.",
          },
          "location": {
            type: "string",
            description: "Storage region (optional). Defaults to primary region.",
          },
        },
        required: ["name"],
      },
  },
  {
    name: "store_get_bucket",
    description: "Get bucket details | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Bucket ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "store_delete_bucket",
    description: "Delete a bucket | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Bucket ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "store_list_objects",
    description: "List objects in a bucket | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Bucket ID.",
          },
          "prefix": {
            type: "string",
            description: "Filter objects by key prefix (e.g. \"notes/\" to list only keys starting with \"notes/\").",
          },
          "limit": {
            type: "integer",
            minimum: 1,
            maximum: 1000,
            default: 100,
            description: "Maximum number of objects to return (1–1000, default 100).",
          },
          "cursor": {
            type: "string",
            description: "Pagination cursor from the previous response's `next_cursor`.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "store_get_object",
    description: "Download an object | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Bucket ID.",
          },
          "key": {
            type: "string",
            description: "Object key (path). May include slashes.",
          },
        },
        required: ["id","key"],
      },
  },
  {
    name: "store_put_object",
    description: "Upload an object | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Bucket ID.",
          },
          "key": {
            type: "string",
            description: "Object key (path). May include slashes (e.g. \"notes/2026/feb.txt\").",
          },
        },
        required: ["id","key"],
      },
  },
  {
    name: "store_delete_object",
    description: "Delete an object | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Bucket ID.",
          },
          "key": {
            type: "string",
            description: "Object key (path). May include slashes.",
          },
        },
        required: ["id","key"],
      },
  },
  {
    name: "store_get_quota",
    description: "Get bucket quota and usage | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Bucket ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "store_set_quota",
    description: "Set bucket quota | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Bucket ID.",
          },
          "quota_bytes": {
            type: ["integer","null"],
            description: "New quota in bytes, or null to reset to default (100 MB).",
          },
        },
        required: ["id","quota_bytes"],
      },
  },
  {
    name: "store_reconcile_quota",
    description: "Reconcile bucket usage | Price: $0.05",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Bucket ID.",
          },
        },
        required: ["id"],
      },
  },
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleStoreTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "store_list_buckets": {
        const url = new URL(`${baseUrl}/v1/buckets`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.page !== undefined) url.searchParams.set("page", String(args.page));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_create_bucket": {
        const res = await primFetch(`${baseUrl}/v1/buckets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_get_bucket": {
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_delete_bucket": {
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_list_objects": {
        const url = new URL(`${baseUrl}/v1/buckets/${args.id}/objects`);
        if (args.prefix !== undefined) url.searchParams.set("prefix", String(args.prefix));
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.cursor !== undefined) url.searchParams.set("cursor", String(args.cursor));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_get_object": {
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.id}/objects/${args.key}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_put_object": {
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.id}/objects/${args.key}`, { method: "PUT" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_delete_object": {
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.id}/objects/${args.key}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_get_quota": {
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.id}/quota`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_set_quota": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.id}/quota`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_reconcile_quota": {
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.id}/quota/reconcile`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown store tool: ${name}` }],
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
