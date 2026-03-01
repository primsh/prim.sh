// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/track.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const trackTools: Tool[] = [
  {
    name: "track_package",
    description: "Track a package by tracking number and carrier. Returns status, ETA, and full event history. | Price: $0.05",
    inputSchema: {
        type: "object",
        properties: {
          "tracking_number": {
            type: "string",
            description: "Shipment tracking number.",
          },
          "carrier": {
            type: "string",
            description: "Carrier slug (e.g. \"usps\", \"ups\", \"fedex\"). Omit to auto-detect.",
          },
        },
        required: ["tracking_number"],
      },
  },
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleTrackTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "track_package": {
        const res = await primFetch(`${baseUrl}/v1/track`, {
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
          content: [{ type: "text", text: `Unknown track tool: ${name}` }],
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
