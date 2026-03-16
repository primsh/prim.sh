// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/infer.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const inferTools: Tool[] = [
  {
    name: "infer_chat",
    description: "Chat completion. Supports streaming, tool use, structured output.",
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
              properties: {
                "role": {
                  type: "string",
                  enum: ["system","user","assistant","tool"],
                },
                "content": {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "array",
                      items: {
                        type: "object",
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
                            properties: {
                              "url": {
                                type: "string",
                              },
                              "detail": {
                                type: "string",
                                enum: ["auto","low","high"],
                              },
                            },
                            required: ["url"],
                          },
                        },
                        required: ["type"],
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
                    properties: {
                      "id": {
                        type: "string",
                      },
                      "type": {
                        type: "string",
                        const: "function",
                      },
                      "function": {
                        type: "object",
                        properties: {
                          "name": {
                            type: "string",
                          },
                          "arguments": {
                            type: "string",
                          },
                        },
                        required: ["name","arguments"],
                      },
                    },
                    required: ["id","type","function"],
                  },
                },
              },
              required: ["role","content"],
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
            anyOf: [
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
              properties: {
                "type": {
                  type: "string",
                  const: "function",
                },
                "function": {
                  type: "object",
                  properties: {
                    "name": {
                      type: "string",
                    },
                    "description": {
                      type: "string",
                    },
                    "parameters": {
                      type: "object",
                      propertyNames: {
                        type: "string",
                      },
                    },
                  },
                  required: ["name"],
                },
              },
              required: ["type","function"],
            },
          },
          "tool_choice": {
            anyOf: [
              {
                type: "string",
                enum: ["none","auto","required"],
              },
              {
                type: "object",
                properties: {
                  "type": {
                    type: "string",
                    const: "function",
                  },
                  "function": {
                    type: "object",
                    properties: {
                      "name": {
                        type: "string",
                      },
                    },
                    required: ["name"],
                  },
                },
                required: ["type","function"],
              },
            ],
          },
          "response_format": {
            type: "object",
            properties: {
              "type": {
                type: "string",
                enum: ["text","json_object"],
              },
            },
            required: ["type"],
          },
        },
        required: ["model","messages"],
      },
  },
  {
    name: "infer_embed",
    description: "Generate embeddings for text input. Returns vector array.",
    inputSchema: {
        type: "object",
        properties: {
          "model": {
            type: "string",
          },
          "input": {
            anyOf: [
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
    description: "List available models with pricing and capabilities.",
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
