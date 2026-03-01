// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/domain.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const domainTools: Tool[] = [
  {
    name: "domain_search_domains",
    description: "Check availability and pricing for a domain query | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "query": {
            type: "string",
            description: "Domain name or keyword to search",
          },
          "tlds": {
            type: "string",
            description: "Comma-separated TLDs (e.g. com,xyz,io)",
          },
        },
      },
  },
  {
    name: "domain_quote_domain",
    description: "Get a 15-minute price quote for a domain | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "domain": {
            type: "string",
            description: "Domain name to quote (e.g. \"example.com\").",
          },
          "years": {
            type: "number",
            description: "Number of years to register. Default 1.",
          },
        },
        required: ["domain"],
      },
  },
  {
    name: "domain_get_domain_status",
    description: "Full post-registration pipeline status (ns_propagated, zone_active, all_ready) | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "domain": {
            type: "string",
            description: "domain parameter",
          },
        },
        required: ["domain"],
      },
  },
  {
    name: "domain_list_zones",
    description: "List DNS zones owned by the calling wallet (paginated) | Price: $0.001",
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
    name: "domain_create_zone",
    description: "Create a Cloudflare DNS zone. Returns nameservers to set at your registrar. | Price: $0.05",
    inputSchema: {
        type: "object",
        properties: {
          "domain": {
            type: "string",
            description: "Domain name to create a zone for (e.g. \"example.com\").",
          },
        },
        required: ["domain"],
      },
  },
  {
    name: "domain_get_zone",
    description: "Get zone details | Price: $0.001",
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
    name: "domain_delete_zone",
    description: "Delete zone and all records. Irreversible. | Price: $0.01",
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
    name: "domain_activate_zone",
    description: "Request Cloudflare NS re-check for faster activation | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "zone_id parameter",
          },
        },
        required: ["zone_id"],
      },
  },
  {
    name: "domain_verify_zone",
    description: "Check DNS propagation for all zone records | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "zone_id parameter",
          },
        },
        required: ["zone_id"],
      },
  },
  {
    name: "domain_setup_mail",
    description: "Configure MX, SPF, DMARC, DKIM in one call. Idempotent. | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "zone_id parameter",
          },
          "mail_server": {
            type: "string",
            description: "Mail server hostname (e.g. \"mail.prim.sh\").",
          },
          "mail_server_ip": {
            type: "string",
            description: "Mail server IPv4 address (used for SPF record).",
          },
          "dkim": {
            type: "object",
            description: "DKIM keys to configure. Provide rsa and/or ed25519.",
          },
        },
        required: ["zone_id","mail_server","mail_server_ip"],
      },
  },
  {
    name: "domain_batch_records",
    description: "Create, update, and delete DNS records in one atomic request | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "zone_id parameter",
          },
          "create": {
            type: "array",
            items: {
              type: "object",
              required: ["type","name","content"],
              properties: {
                "type": {
                  type: "string",
                  description: "DNS record type.",
                },
                "name": {
                  type: "string",
                  description: "DNS record name.",
                },
                "content": {
                  type: "string",
                  description: "DNS record value.",
                },
                "ttl": {
                  type: "number",
                  description: "TTL in seconds. Default 1 (auto).",
                },
                "proxied": {
                  type: "boolean",
                  description: "Enable Cloudflare proxying. Default false.",
                },
                "priority": {
                  type: "number",
                  description: "Priority for MX and SRV records.",
                },
              },
            },
            description: "Records to create.",
          },
          "update": {
            type: "array",
            items: {
              type: "object",
              required: ["id"],
              properties: {
                "id": {
                  type: "string",
                  description: "ID of the record to update.",
                },
                "content": {
                  type: "string",
                  description: "New DNS record value.",
                },
                "ttl": {
                  type: "number",
                  description: "New TTL in seconds.",
                },
                "proxied": {
                  type: "boolean",
                  description: "Updated proxying flag.",
                },
                "priority": {
                  type: "number",
                  description: "Updated priority.",
                },
                "type": {
                  type: "string",
                  description: "Updated record type.",
                },
                "name": {
                  type: "string",
                  description: "Updated record name.",
                },
              },
            },
            description: "Records to update.",
          },
          "delete": {
            type: "array",
            items: {
              type: "object",
              required: ["id"],
              properties: {
                "id": {
                  type: "string",
                  description: "ID of the record to delete.",
                },
              },
            },
            description: "Records to delete.",
          },
        },
        required: ["zone_id"],
      },
  },
  {
    name: "domain_list_records",
    description: "List all records in a DNS zone | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "zone_id parameter",
          },
        },
        required: ["zone_id"],
      },
  },
  {
    name: "domain_create_record",
    description: "Create a DNS record (A, AAAA, CNAME, MX, TXT, SRV, CAA, NS) | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "zone_id parameter",
          },
          "type": {
            type: "string",
            description: "DNS record type.",
          },
          "name": {
            type: "string",
            description: "DNS record name (hostname).",
          },
          "content": {
            type: "string",
            description: "DNS record value.",
          },
          "ttl": {
            type: "number",
            description: "TTL in seconds. Default 1 (auto).",
          },
          "proxied": {
            type: "boolean",
            description: "Enable Cloudflare proxying. Default false.",
          },
          "priority": {
            type: "number",
            description: "Priority for MX and SRV records.",
          },
        },
        required: ["zone_id","type","name","content"],
      },
  },
  {
    name: "domain_get_record",
    description: "Get a single DNS record | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "zone_id parameter",
          },
          "id": {
            type: "string",
            description: "id parameter",
          },
        },
        required: ["zone_id","id"],
      },
  },
  {
    name: "domain_update_record",
    description: "Update a DNS record | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "zone_id parameter",
          },
          "id": {
            type: "string",
            description: "id parameter",
          },
          "type": {
            type: "string",
            description: "DNS record type.",
          },
          "name": {
            type: "string",
            description: "DNS record name.",
          },
          "content": {
            type: "string",
            description: "DNS record value.",
          },
          "ttl": {
            type: "number",
            description: "TTL in seconds.",
          },
          "proxied": {
            type: "boolean",
            description: "Enable Cloudflare proxying.",
          },
          "priority": {
            type: "number",
            description: "Priority for MX and SRV records.",
          },
        },
        required: ["zone_id","id"],
      },
  },
  {
    name: "domain_delete_record",
    description: "Delete a DNS record | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "zone_id parameter",
          },
          "id": {
            type: "string",
            description: "id parameter",
          },
        },
        required: ["zone_id","id"],
      },
  },
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleDomainTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "domain_search_domains": {
        const url = new URL(`${baseUrl}/v1/domains/search`);
        if (args.query !== undefined) url.searchParams.set("query", String(args.query));
        if (args.tlds !== undefined) url.searchParams.set("tlds", String(args.tlds));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_quote_domain": {
        const res = await primFetch(`${baseUrl}/v1/domains/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_get_domain_status": {
        const res = await primFetch(`${baseUrl}/v1/domains/${args.domain}/status`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_list_zones": {
        const url = new URL(`${baseUrl}/v1/zones`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.after !== undefined) url.searchParams.set("after", String(args.after));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_create_zone": {
        const res = await primFetch(`${baseUrl}/v1/zones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_get_zone": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_delete_zone": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_activate_zone": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/activate`, { method: "PUT" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_verify_zone": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/verify`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_setup_mail": {
        const { zone_id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/mail-setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_batch_records": {
        const { zone_id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_list_records": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_create_record": {
        const { zone_id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_get_record": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_update_record": {
        const { zone_id, id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records/${args.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_delete_record": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records/${args.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown domain tool: ${name}` }],
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
