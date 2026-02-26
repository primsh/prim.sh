import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { buildReport } from "../../../../scripts/report.js";

export const reportTools: Tool[] = [
  {
    name: "prim_report",
    description:
      "Generate a full Prim system report: service metrics (uptime, requests, errors, revenue), infrastructure costs (VPS, domain, R2, Tavily), and on-chain USDC revenue. Returns structured JSON. Requires DO_API_TOKEN, CF_API_TOKEN, CF_ACCOUNT_ID, BASE_RPC_URL, PRIM_PAY_TO env vars for full data.",
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

  try {
    const report = await buildReport();
    return {
      content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
    };
  } catch (err) {
    return {
      content: [
        { type: "text", text: `Error generating report: ${err instanceof Error ? err.message : String(err)}` },
      ],
      isError: true,
    };
  }
}
