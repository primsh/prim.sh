// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/search.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const searchTools: Tool[] = [
  {
    name: "search_web",
    description: "Search the web and return ranked results with optional AI-generated answer | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "query": {
            type: "string",
            description: "Search query string.",
          },
          "max_results": {
            type: "number",
            description: "Maximum number of results to return. 1-20, default 10.",
          },
          "search_depth": {
            type: "string",
            enum: ["basic","advanced"],
            description: "Search depth. \"basic\" | \"advanced\", default \"basic\".",
          },
          "country": {
            type: "string",
            description: "Two-letter ISO 3166-1 country code to bias results (e.g. \"US\").",
          },
          "time_range": {
            type: "string",
            enum: ["day","week","month","year"],
            description: "Restrict results by recency. \"day\" | \"week\" | \"month\" | \"year\".",
          },
          "include_answer": {
            type: "boolean",
            description: "Include AI-generated answer summarizing top results. Default false.",
          },
          "include_domains": {
            type: "array",
            items: {
              type: "string",
            },
            description: "Restrict results to these domains only (e.g. [\"docs.base.org\"]).",
          },
          "exclude_domains": {
            type: "array",
            items: {
              type: "string",
            },
            description: "Exclude results from these domains (e.g. [\"reddit.com\"]).",
          },
        },
        required: ["query"],
      },
  },
  {
    name: "search_news",
    description: "Search for recent news articles, ordered by recency | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "query": {
            type: "string",
            description: "Search query string.",
          },
          "max_results": {
            type: "number",
            description: "Maximum number of results to return. 1-20, default 10.",
          },
          "search_depth": {
            type: "string",
            enum: ["basic","advanced"],
            description: "Search depth. \"basic\" | \"advanced\", default \"basic\".",
          },
          "country": {
            type: "string",
            description: "Two-letter ISO 3166-1 country code to bias results (e.g. \"US\").",
          },
          "time_range": {
            type: "string",
            enum: ["day","week","month","year"],
            description: "Restrict results by recency. \"day\" | \"week\" | \"month\" | \"year\".",
          },
          "include_answer": {
            type: "boolean",
            description: "Include AI-generated answer summarizing top results. Default false.",
          },
          "include_domains": {
            type: "array",
            items: {
              type: "string",
            },
            description: "Restrict results to these domains only (e.g. [\"docs.base.org\"]).",
          },
          "exclude_domains": {
            type: "array",
            items: {
              type: "string",
            },
            description: "Exclude results from these domains (e.g. [\"reddit.com\"]).",
          },
        },
        required: ["query"],
      },
  },
  {
    name: "search_extract_url",
    description: "Extract readable content from one or more URLs as markdown or plain text | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "urls": {
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
            description: "URL string or array of URLs to extract content from.",
          },
          "format": {
            type: "string",
            enum: ["markdown","text"],
            description: "Output format. \"markdown\" | \"text\", default \"markdown\".",
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

      case "search_extract_url": {
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
