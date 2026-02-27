import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const reportTools: Tool[] = [
  {
    name: "prim_report",
    description:
      "Generate a full Prim system report. Currently unavailable — the internal report module was removed during repo scrub (HRD-23).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function handleReportTool(
  name: string,
  _args: Record<string, unknown>,
): Promise<CallToolResult> {
  if (name !== "prim_report") {
    return {
      content: [{ type: "text", text: `Unknown report tool: ${name}` }],
      isError: true,
    };
  }

  return {
    content: [
      { type: "text", text: "prim_report is currently unavailable — the internal report module was removed during repo scrub (HRD-23)." },
    ],
    isError: true,
  };
}
