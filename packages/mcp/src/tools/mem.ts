import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const memTools: Tool[] = [
  {
    name: "mem_collection_create",
    description:
      "Create a new vector collection for semantic search. Collections store embedded documents and support similarity queries.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "string",
          description: "Collection name. Must be unique per wallet.",
        },
        distance: {
          type: "string",
          enum: ["Cosine", "Euclid", "Dot"],
          description: "Distance metric for similarity search (default: Cosine).",
        },
        dimension: {
          type: "integer",
          description: "Vector dimension (default: 1536 for text-embedding-3-small).",
        },
      },
    },
  },
  {
    name: "mem_collection_list",
    description:
      "List all vector collections owned by the authenticated wallet. document_count is null in list responses — use mem_collection_get for a live count.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of collections per page (1–100, default 20).",
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
    name: "mem_collection_get",
    description:
      "Get details for a single collection including live document_count from Qdrant.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Collection ID (UUID).",
        },
      },
    },
  },
  {
    name: "mem_collection_delete",
    description:
      "Delete a collection and all its documents. This is irreversible — all embeddings are permanently removed.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Collection ID (UUID).",
        },
      },
    },
  },
  {
    name: "mem_upsert",
    description:
      "Embed and store documents in a collection. Each document is vectorized using the collection's embedding model and upserted into Qdrant. Existing documents with the same ID are replaced.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "documents"],
      properties: {
        collection_id: {
          type: "string",
          description: "Collection ID (UUID).",
        },
        documents: {
          type: "array",
          description: "Documents to embed and upsert.",
          items: {
            type: "object",
            required: ["text"],
            properties: {
              id: {
                type: "string",
                description: "Document UUID. Auto-generated if omitted.",
              },
              text: {
                type: "string",
                description: "Text content to embed and store.",
              },
              metadata: {
                type: "object",
                description: "Arbitrary key-value metadata stored alongside the vector.",
              },
            },
          },
        },
      },
    },
  },
  {
    name: "mem_query",
    description:
      "Perform a semantic similarity search in a collection. Embeds the query text and returns the most similar documents by score.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "text"],
      properties: {
        collection_id: {
          type: "string",
          description: "Collection ID (UUID).",
        },
        text: {
          type: "string",
          description: "Query text to embed and search for.",
        },
        top_k: {
          type: "integer",
          description: "Maximum number of results to return (default 10).",
        },
        filter: {
          type: "object",
          description:
            "Qdrant-native filter for metadata filtering alongside semantic search.",
        },
      },
    },
  },
  {
    name: "mem_cache_put",
    description:
      "Store a value in the key-value cache under a namespace and key. The namespace is scoped to the authenticated wallet. Pass ttl (seconds) for auto-expiry, or omit for permanent storage.",
    inputSchema: {
      type: "object",
      required: ["namespace", "key", "value"],
      properties: {
        namespace: {
          type: "string",
          description: "Cache namespace (scoped to wallet).",
        },
        key: {
          type: "string",
          description: "Cache key.",
        },
        value: {
          description: "Value to store (any JSON-serializable type).",
        },
        ttl: {
          type: ["integer", "null"],
          description: "TTL in seconds. Omit or null for permanent.",
        },
      },
    },
  },
  {
    name: "mem_cache_get",
    description:
      "Retrieve a cached value by namespace and key. Returns 404 if the entry does not exist or has expired.",
    inputSchema: {
      type: "object",
      required: ["namespace", "key"],
      properties: {
        namespace: {
          type: "string",
          description: "Cache namespace.",
        },
        key: {
          type: "string",
          description: "Cache key.",
        },
      },
    },
  },
  {
    name: "mem_cache_delete",
    description: "Delete a cached entry by namespace and key.",
    inputSchema: {
      type: "object",
      required: ["namespace", "key"],
      properties: {
        namespace: {
          type: "string",
          description: "Cache namespace.",
        },
        key: {
          type: "string",
          description: "Cache key.",
        },
      },
    },
  },
];

export async function handleMemTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "mem_collection_create": {
        const body: Record<string, unknown> = { name: args.name };
        if (args.distance) body.distance = args.distance;
        if (args.dimension) body.dimension = args.dimension;
        const res = await primFetch(`${baseUrl}/v1/collections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_collection_list": {
        const url = new URL(`${baseUrl}/v1/collections`);
        if (args.limit) url.searchParams.set("limit", String(args.limit));
        if (args.page) url.searchParams.set("page", String(args.page));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_collection_get": {
        const res = await primFetch(`${baseUrl}/v1/collections/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_collection_delete": {
        const res = await primFetch(`${baseUrl}/v1/collections/${args.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_upsert": {
        const res = await primFetch(`${baseUrl}/v1/collections/${args.collection_id}/upsert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documents: args.documents }),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_query": {
        const body: Record<string, unknown> = { text: args.text };
        if (args.top_k) body.top_k = args.top_k;
        if (args.filter) body.filter = args.filter;
        const res = await primFetch(`${baseUrl}/v1/collections/${args.collection_id}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_cache_put": {
        const { namespace, key, value, ttl } = args as {
          namespace: string;
          key: string;
          value: unknown;
          ttl?: number | null;
        };
        const body: Record<string, unknown> = { value };
        if (ttl !== undefined) body.ttl = ttl;
        const res = await primFetch(`${baseUrl}/v1/cache/${namespace}/${key}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_cache_get": {
        const res = await primFetch(`${baseUrl}/v1/cache/${args.namespace}/${args.key}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mem_cache_delete": {
        const res = await primFetch(`${baseUrl}/v1/cache/${args.namespace}/${args.key}`, {
          method: "DELETE",
        });
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
