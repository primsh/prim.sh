// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/mem.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const memTools: Tool[] = [
  {
    name: "mem_list_collections",
    description: "List collections owned by the calling wallet (paginated). document_count is null — use GET :id. | Price: $0.001",
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
    name: "mem_create_collection",
    description: "Create a vector collection | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "name": {
            type: "string",
            description: "Collection name. Unique per wallet.",
          },
          "distance": {
            type: "string",
            enum: ["Cosine","Euclid","Dot"],
            description: "Distance metric for similarity search. Default \"Cosine\".",
          },
          "dimension": {
            type: "number",
            description: "Vector dimension. Must match the embedding model used. Default 1536.",
          },
        },
        required: ["name"],
      },
  },
  {
    name: "mem_get_collection",
    description: "Get collection with live document_count from Qdrant | Price: $0.001",
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
    name: "mem_delete_collection",
    description: "Delete collection and all documents. Irreversible. | Price: $0.01",
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
    name: "mem_upsert_documents",
    description: "Embed and store documents. Each document: {id?, text, metadata?}. Existing IDs are replaced. | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "documents": {
            type: "array",
            items: {
              type: "object",
              required: ["text"],
              properties: {
                "id": {
                  type: "string",
                  description: "Must be UUID v4 if provided; omit to auto-generate.",
                },
                "text": {
                  type: "string",
                  description: "Document text to embed and store.",
                },
                "metadata": {
                  type: "string",
                  description: "Arbitrary JSON metadata to store alongside the vector.",
                },
              },
            },
            description: "Documents to upsert. Existing IDs are overwritten.",
          },
        },
        required: ["id","documents"],
      },
  },
  {
    name: "mem_query_collection",
    description: "Semantic search. Fields: text (required), top_k, filter (Qdrant native format). | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "text": {
            type: "string",
            description: "Query text to embed and search against.",
          },
          "top_k": {
            type: "number",
            description: "Number of nearest neighbors to return. Default 10.",
          },
          "filter": {
            type: "string",
            description: "Qdrant-native filter passthrough.",
          },
        },
        required: ["id","text"],
      },
  },
  {
    name: "mem_get_cache",
    description: "Retrieve a cache value. Returns 404 if missing or expired. | Price: $0.0001",
    inputSchema: {
        type: "object",
        properties: {
          "namespace": {
            type: "string",
            description: "namespace parameter",
          },
          "key": {
            type: "string",
            description: "key parameter",
          },
        },
        required: ["namespace","key"],
      },
  },
  {
    name: "mem_set_cache",
    description: "Store a value in the KV cache. Optional ttl in seconds for expiry. | Price: $0.0001",
    inputSchema: {
        type: "object",
        properties: {
          "namespace": {
            type: "string",
            description: "namespace parameter",
          },
          "key": {
            type: "string",
            description: "key parameter",
          },
          "value": {
            type: "string",
            description: "Value to store. Any JSON-serializable value.",
          },
          "ttl": {
            type: ["number","null"],
            description: "TTL in seconds. Omit or null for permanent.",
          },
        },
        required: ["namespace","key","value"],
      },
  },
  {
    name: "mem_delete_cache",
    description: "Delete a cache entry | Price: $0.0001",
    inputSchema: {
        type: "object",
        properties: {
          "namespace": {
            type: "string",
            description: "namespace parameter",
          },
          "key": {
            type: "string",
            description: "key parameter",
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
      case "mem_list_collections": {
        const url = new URL(`${baseUrl}/v1/collections`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.after !== undefined) url.searchParams.set("after", String(args.after));
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
