import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const createTools: Tool[] = [
  {
    name: "create_scaffold",
    description: "Generate a complete prim package from a prim.yaml spec. Returns file manifest with contents. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
  {
    name: "create_validate",
    description: "Validate a prim.yaml spec against the schema without generating files. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
  {
    name: "create_get_schema",
    description: "Return the prim.yaml JSON schema for agents to reference when writing specs. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
  {
    name: "create_get_ports",
    description: "Return allocated ports and next available port number. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleCreateTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "create_scaffold": {
        const res = await primFetch(`${baseUrl}/v1/scaffold`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "create_validate": {
        const res = await primFetch(`${baseUrl}/v1/validate`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "create_get_schema": {
        const res = await primFetch(`${baseUrl}/v1/schema`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "create_get_ports": {
        const res = await primFetch(`${baseUrl}/v1/ports`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown create tool: ${name}` }],
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
