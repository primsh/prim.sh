// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/search.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const searchTools: Tool[] = [
  {
    name: "search_web",
    description: "Web search | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "query": {
            type: "string",
            description: "Search query string.",
          },
          "max_results": {
            type: "integer",
            description: "Maximum number of results to return. Range 1–20.",
            minimum: 1,
            maximum: 20,
            default: 10,
          },
          "search_depth": {
            type: "string",
            enum: ["basic","advanced"],
            description: "Search depth. \"advanced\" uses more sources and costs more upstream compute.",
            default: "basic",
          },
          "country": {
            type: "string",
            description: "Two-letter ISO 3166-1 alpha-2 country code to bias results.",
          },
          "time_range": {
            type: "string",
            enum: ["day","week","month","year"],
            description: "Restrict results to the given time range.",
          },
          "include_answer": {
            type: "boolean",
            description: "If true, the response includes an AI-generated answer summarizing the results.",
            default: false,
          },
          "include_domains": {
            type: "array",
            items: {
              type: "string",
            },
            description: "Restrict results to these domains only.",
          },
          "exclude_domains": {
            type: "array",
            items: {
              type: "string",
            },
            description: "Exclude results from these domains.",
          },
        },
        required: ["query"],
      },
  },
  {
    name: "search_news",
    description: "News search | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "query": {
            type: "string",
            description: "Search query string.",
          },
          "max_results": {
            type: "integer",
            description: "Maximum number of results to return. Range 1–20.",
            minimum: 1,
            maximum: 20,
            default: 10,
          },
          "search_depth": {
            type: "string",
            enum: ["basic","advanced"],
            description: "Search depth. \"advanced\" uses more sources and costs more upstream compute.",
            default: "basic",
          },
          "country": {
            type: "string",
            description: "Two-letter ISO 3166-1 alpha-2 country code to bias results.",
          },
          "time_range": {
            type: "string",
            enum: ["day","week","month","year"],
            description: "Restrict results to the given time range.",
          },
          "include_answer": {
            type: "boolean",
            description: "If true, the response includes an AI-generated answer summarizing the results.",
            default: false,
          },
          "include_domains": {
            type: "array",
            items: {
              type: "string",
            },
            description: "Restrict results to these domains only.",
          },
          "exclude_domains": {
            type: "array",
            items: {
              type: "string",
            },
            description: "Exclude results from these domains.",
          },
        },
        required: ["query"],
      },
  },
  {
    name: "search_extract_urls",
    description: "Extract URL content | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "urls": {
            oneOf: [
              {
                type: "string",
                format: "uri",
                description: "A single URL to extract content from.",
              },
              {
                type: "array",
                items: {
                  type: "string",
                  format: "uri",
                },
                description: "Multiple URLs to extract content from in one request.",
              },
            ],
            description: "URL or array of URLs to extract content from.",
          },
          "format": {
            type: "string",
            enum: ["markdown","text"],
            description: "Output format for extracted content.",
            default: "markdown",
          },
        },
        required: ["urls"],
      },
  },
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleSearchTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "search_web": {
        const res = await primFetch(`${baseUrl}/v1/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "search_news": {
        const res = await primFetch(`${baseUrl}/v1/search/news`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "search_extract_urls": {
        const res = await primFetch(`${baseUrl}/v1/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown search tool: ${name}` }],
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
