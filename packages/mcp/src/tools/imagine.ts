// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/imagine.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const imagineTools: Tool[] = [
  {
    name: "imagine_generate",
    description: "Generate an image from a text prompt. Returns base64 or URL. | Price: $0.02",
    inputSchema: {
        type: "object",
      },
  },
  {
    name: "imagine_describe",
    description: "Describe an image. Accepts base64 or URL. Returns text description. | Price: $0.005",
    inputSchema: {
        type: "object",
      },
  },
  {
    name: "imagine_upscale",
    description: "Upscale an image to higher resolution. Accepts base64 or URL. | Price: $0.02",
    inputSchema: {
        type: "object",
      },
  },
  {
    name: "imagine_list_models",
    description: "List available image models with capabilities and pricing. | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleImagineTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "imagine_generate": {
        const res = await primFetch(`${baseUrl}/v1/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "imagine_describe": {
        const res = await primFetch(`${baseUrl}/v1/describe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "imagine_upscale": {
        const res = await primFetch(`${baseUrl}/v1/upscale`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "imagine_list_models": {
        const res = await primFetch(`${baseUrl}/v1/models`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown imagine tool: ${name}` }],
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
