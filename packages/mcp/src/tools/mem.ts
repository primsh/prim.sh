import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const memTools: Tool[] = [
  {
    name: "mem_llms_txt",
    description: "Machine-readable API reference",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
  {
    name: "mem_list_collections",
    description: "List collections | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "limit": {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
            description: "Number of collections per page (1–100, default 20).",
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
    name: "mem_create_collection",
    description: "Create a collection | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "name": {
            type: "string",
            description: "Collection name. Must be unique per wallet.",
          },
          "distance": {
            type: "string",
            enum: ["Cosine","Euclid","Dot"],
            description: "Distance metric (default Cosine).",
          },
          "dimension": {
            type: "integer",
            description: "Vector dimension (default 1536 for text-embedding-3-small).",
          },
        },
        required: ["name"],
      },
  },
  {
    name: "mem_get_collection",
    description: "Get collection details | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Collection ID (UUID).",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "mem_delete_collection",
    description: "Delete a collection | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Collection ID (UUID).",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "mem_upsert_documents",
    description: "Upsert documents | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Collection ID (UUID).",
          },
          "documents": {
            type: "array",
            items: {
              type: "object",
              required: ["text"],
              properties: {
                "id": {
                  type: "string",
                  format: "uuid",
                  description: "Document UUID. Auto-generated if omitted.",
                },
                "text": {
                  type: "string",
                  description: "Text content to embed and store.",
                },
                "metadata": {
                  type: "object",
                  additionalProperties: true,
                  description: "Arbitrary key-value metadata stored alongside the vector.",
                },
              },
            },
            description: "Documents to embed and upsert.",
          },
        },
        required: ["id","documents"],
      },
  },
  {
    name: "mem_query_collection",
    description: "Semantic query | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Collection ID (UUID).",
          },
          "text": {
            type: "string",
            description: "Query text to embed and search.",
          },
          "top_k": {
            type: "integer",
            description: "Maximum number of results to return (default 10).",
          },
          "filter": {
            description: "Qdrant-native filter passthrough for metadata filtering.",
          },
        },
        required: ["id","text"],
      },
  },
  {
    name: "mem_get_cache",
    description: "Get cache entry | Price: $0.0001",
    inputSchema: {
        type: "object",
        properties: {
          "namespace": {
            type: "string",
            description: "Cache namespace.",
          },
          "key": {
            type: "string",
            description: "Cache key.",
          },
        },
        required: ["namespace","key"],
      },
  },
  {
    name: "mem_set_cache",
    description: "Set cache entry | Price: $0.0001",
    inputSchema: {
        type: "object",
        properties: {
          "namespace": {
            type: "string",
            description: "Cache namespace (scoped to wallet).",
          },
          "key": {
            type: "string",
            description: "Cache key.",
          },
          "value": {
            description: "Value to store (any JSON-serializable type).",
          },
          "ttl": {
            type: ["integer","null"],
            description: "TTL in seconds. Omit or null for permanent.",
          },
        },
        required: ["namespace","key","value"],
      },
  },
  {
    name: "mem_delete_cache",
    description: "Delete cache entry | Price: $0.0001",
    inputSchema: {
        type: "object",
        properties: {
          "namespace": {
            type: "string",
            description: "Cache namespace.",
          },
          "key": {
            type: "string",
            description: "Cache key.",
          },
        },
        required: ["namespace","key"],
      },
  },
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleMemTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "mem_llms_txt": {
        const res = await primFetch(`${baseUrl}/llms.txt`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_list_collections": {
        const url = new URL(`${baseUrl}/v1/collections`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.page !== undefined) url.searchParams.set("page", String(args.page));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_create_collection": {
        const res = await primFetch(`${baseUrl}/v1/collections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_get_collection": {
        const res = await primFetch(`${baseUrl}/v1/collections/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_delete_collection": {
        const res = await primFetch(`${baseUrl}/v1/collections/${args.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_upsert_documents": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/collections/${args.id}/upsert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_query_collection": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/collections/${args.id}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_get_cache": {
        const res = await primFetch(`${baseUrl}/v1/cache/${args.namespace}/${args.key}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_set_cache": {
        const { namespace, key, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/cache/${args.namespace}/${args.key}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_delete_cache": {
        const res = await primFetch(`${baseUrl}/v1/cache/${args.namespace}/${args.key}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown mem tool: ${name}` }],
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
