// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/infer.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const inferTools: Tool[] = [
  {
    name: "infer_chat",
    description: "Chat completion. Supports streaming, tool use, structured output. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "model": {
            type: "string",
          },
          "messages": {
            type: "array",
            items: {
              type: "object",
              required: ["role","content"],
              properties: {
                "role": {
                  type: "string",
                  enum: ["system","user","assistant","tool"],
                },
                "content": {
                  oneOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["type"],
                        properties: {
                          "type": {
                            type: "string",
                            enum: ["text","image_url"],
                          },
                          "text": {
                            type: "string",
                          },
                          "image_url": {
                            type: "object",
                          },
                        },
                      },
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                "name": {
                  type: "string",
                },
                "tool_call_id": {
                  type: "string",
                },
                "tool_calls": {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id","type","function"],
                    properties: {
                      "id": {
                        type: "string",
                      },
                      "type": {
                        type: "string",
                        enum: ["function"],
                      },
                      "function": {
                        type: "object",
                      },
                    },
                  },
                },
              },
            },
          },
          "temperature": {
            type: "number",
          },
          "max_tokens": {
            type: "number",
          },
          "top_p": {
            type: "number",
          },
          "frequency_penalty": {
            type: "number",
          },
          "presence_penalty": {
            type: "number",
          },
          "stop": {
            oneOf: [
              {
                type: "string",
              },
              {
                type: "array",
                items: {
                  type: "string",
                },
              },
            ],
          },
          "stream": {
            type: "boolean",
          },
          "tools": {
            type: "array",
            items: {
              type: "object",
              required: ["type","function"],
              properties: {
                "type": {
                  type: "string",
                  enum: ["function"],
                },
                "function": {
                  type: "object",
                },
              },
            },
          },
          "tool_choice": {
            oneOf: [
              {
                type: "string",
                enum: ["none","auto","required"],
              },
              {
                type: "object",
              },
            ],
          },
          "response_format": {
            type: "object",
          },
        },
        required: ["model","messages"],
      },
  },
  {
    name: "infer_embed",
    description: "Generate embeddings for text input. Returns vector array. | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "model": {
            type: "string",
          },
          "input": {
            oneOf: [
              {
                type: "string",
              },
              {
                type: "array",
                items: {
                  type: "string",
                },
              },
            ],
          },
        },
        required: ["model","input"],
      },
  },
  {
    name: "infer_list_models",
    description: "List available models with pricing and capabilities. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleInferTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "infer_chat": {
        const res = await primFetch(`${baseUrl}/v1/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "infer_embed": {
        const res = await primFetch(`${baseUrl}/v1/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "infer_list_models": {
        const res = await primFetch(`${baseUrl}/v1/models`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown infer tool: ${name}` }],
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
