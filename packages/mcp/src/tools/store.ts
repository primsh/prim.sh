import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const storeTools: Tool[] = [
  {
    name: "store_bucket_create",
    description:
      "Create a new storage bucket owned by the paying wallet. Limit: 10 buckets per wallet. Bucket names must be unique per wallet.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "string",
          description:
            "Bucket name. Must be unique per wallet. Use alphanumeric characters, hyphens, or underscores.",
        },
        location: {
          type: "string",
          description: "Storage region (optional). Defaults to primary region.",
        },
      },
    },
  },
  {
    name: "store_bucket_list",
    description:
      "List all storage buckets owned by the authenticated wallet. Returns paginated results.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of buckets per page (1-100, default 20).",
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
    name: "store_bucket_get",
    description:
      "Get details for a single storage bucket including usage and quota.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Bucket ID (UUID).",
        },
      },
    },
  },
  {
    name: "store_bucket_delete",
    description:
      "Delete a storage bucket. The bucket must be empty before deletion.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Bucket ID (UUID).",
        },
      },
    },
  },
  {
    name: "store_object_put",
    description:
      "Upload an object to a bucket. Accepts base64-encoded content. The object key is the path within the bucket (e.g. 'notes/2026/feb.txt'). Fails if the upload would exceed the bucket quota.",
    inputSchema: {
      type: "object",
      required: ["bucket_id", "key", "content"],
      properties: {
        bucket_id: {
          type: "string",
          description: "Bucket ID (UUID).",
        },
        key: {
          type: "string",
          description:
            "Object key (path within bucket). May include slashes for pseudo-directories.",
        },
        content: {
          type: "string",
          description: "Base64-encoded content to upload.",
        },
        content_type: {
          type: "string",
          description: "MIME type of the object (e.g. 'text/plain'). Stored and returned on download.",
        },
      },
    },
  },
  {
    name: "store_object_list",
    description:
      "List objects in a bucket with optional prefix filtering. Cursor-based pagination.",
    inputSchema: {
      type: "object",
      required: ["bucket_id"],
      properties: {
        bucket_id: {
          type: "string",
          description: "Bucket ID (UUID).",
        },
        prefix: {
          type: "string",
          description:
            "Filter objects by key prefix (e.g. 'notes/' to list only keys starting with 'notes/').",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          default: 100,
          description: "Maximum number of objects to return (1-1000, default 100).",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor from the previous response's next_cursor.",
        },
      },
    },
  },
  {
    name: "store_object_get",
    description:
      "Download an object from a bucket. Returns the content as base64-encoded data.",
    inputSchema: {
      type: "object",
      required: ["bucket_id", "key"],
      properties: {
        bucket_id: {
          type: "string",
          description: "Bucket ID (UUID).",
        },
        key: {
          type: "string",
          description: "Object key (path within bucket). May include slashes.",
        },
      },
    },
  },
  {
    name: "store_object_delete",
    description: "Delete an object from a bucket.",
    inputSchema: {
      type: "object",
      required: ["bucket_id", "key"],
      properties: {
        bucket_id: {
          type: "string",
          description: "Bucket ID (UUID).",
        },
        key: {
          type: "string",
          description: "Object key (path within bucket). May include slashes.",
        },
      },
    },
  },
  {
    name: "store_quota_get",
    description:
      "Get the storage quota and current usage for a bucket.",
    inputSchema: {
      type: "object",
      required: ["bucket_id"],
      properties: {
        bucket_id: {
          type: "string",
          description: "Bucket ID (UUID).",
        },
      },
    },
  },
  {
    name: "store_quota_set",
    description:
      "Set the storage quota for a bucket. Pass null to reset to the default (100 MB).",
    inputSchema: {
      type: "object",
      required: ["bucket_id", "quota_bytes"],
      properties: {
        bucket_id: {
          type: "string",
          description: "Bucket ID (UUID).",
        },
        quota_bytes: {
          type: ["integer", "null"],
          description:
            "New quota in bytes, or null to reset to default (100 MB). Example: 52428800 for 50 MB.",
        },
      },
    },
  },
  {
    name: "store_quota_reconcile",
    description:
      "Recompute the bucket's usage_bytes by scanning actual storage. Use if usage appears incorrect after bulk operations.",
    inputSchema: {
      type: "object",
      required: ["bucket_id"],
      properties: {
        bucket_id: {
          type: "string",
          description: "Bucket ID (UUID).",
        },
      },
    },
  },
];

export async function handleStoreTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "store_bucket_create": {
        const body: Record<string, unknown> = { name: args.name };
        if (args.location) body.location = args.location;
        const res = await primFetch(`${baseUrl}/v1/buckets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_bucket_list": {
        const url = new URL(`${baseUrl}/v1/buckets`);
        if (args.limit) url.searchParams.set("limit", String(args.limit));
        if (args.page) url.searchParams.set("page", String(args.page));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_bucket_get": {
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_bucket_delete": {
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_object_put": {
        const { bucket_id, key, content, content_type } = args as {
          bucket_id: string;
          key: string;
          content: string;
          content_type?: string;
        };
        const bytes = Buffer.from(content, "base64");
        const headers: Record<string, string> = {
          "Content-Length": String(bytes.length),
        };
        if (content_type) headers["Content-Type"] = content_type;
        const encodedKey = encodeURIComponent(key);
        const res = await primFetch(
          `${baseUrl}/v1/buckets/${bucket_id}/objects/${encodedKey}`,
          {
            method: "PUT",
            headers,
            body: bytes,
          },
        );
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_object_list": {
        const url = new URL(
          `${baseUrl}/v1/buckets/${args.bucket_id}/objects`,
        );
        if (args.prefix) url.searchParams.set("prefix", String(args.prefix));
        if (args.limit) url.searchParams.set("limit", String(args.limit));
        if (args.cursor) url.searchParams.set("cursor", String(args.cursor));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_object_get": {
        const { bucket_id, key } = args as { bucket_id: string; key: string };
        const encodedKey = encodeURIComponent(key);
        const res = await primFetch(
          `${baseUrl}/v1/buckets/${bucket_id}/objects/${encodedKey}`,
        );
        if (!res.ok) {
          const data = await res.json();
          return errorResult(data);
        }
        const bytes = await res.arrayBuffer();
        const b64 = Buffer.from(bytes).toString("base64");
        const contentType = res.headers.get("content-type") ?? "application/octet-stream";
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { content_type: contentType, content_base64: b64, size: bytes.byteLength },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "store_object_delete": {
        const { bucket_id, key } = args as { bucket_id: string; key: string };
        const encodedKey = encodeURIComponent(key);
        const res = await primFetch(
          `${baseUrl}/v1/buckets/${bucket_id}/objects/${encodedKey}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_quota_get": {
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.bucket_id}/quota`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_quota_set": {
        const res = await primFetch(`${baseUrl}/v1/buckets/${args.bucket_id}/quota`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quota_bytes: args.quota_bytes }),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "store_quota_reconcile": {
        const res = await primFetch(
          `${baseUrl}/v1/buckets/${args.bucket_id}/quota/reconcile`,
          { method: "POST" },
        );
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
