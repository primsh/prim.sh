// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/domain.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const domainTools: Tool[] = [
  {
    name: "domain_search_domains",
    description: "Search domain availability | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "query": {
            type: "string",
            description: "Domain name to search (without TLD, e.g. \"myagent\").",
          },
          "tlds": {
            type: "string",
            description: "Comma-separated TLDs to check (e.g. \"com,xyz,io\"). Defaults to common TLDs.",
          },
        },
        required: ["query"],
      },
  },
  {
    name: "domain_quote_domain",
    description: "Get price quote | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "domain": {
            type: "string",
            description: "Fully qualified domain name to quote.",
          },
          "years": {
            type: "integer",
            description: "Registration period in years (default 1).",
          },
        },
        required: ["domain"],
      },
  },
  {
    name: "domain_register_domain",
    description: "Register domain | Price: dynamic (from quote)",
    inputSchema: {
        type: "object",
        properties: {
          "quote_id": {
            type: "string",
            description: "Quote ID from POST /v1/domains/quote. Valid for 15 minutes.",
          },
        },
        required: ["quote_id"],
      },
  },
  {
    name: "domain_recover_registration",
    description: "Recover registration",
    inputSchema: {
        type: "object",
        properties: {
          "recovery_token": {
            type: "string",
            description: "Recovery token from the original RegisterResponse.",
          },
        },
        required: ["recovery_token"],
      },
  },
  {
    name: "domain_get_domain_status",
    description: "Registration status | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "domain": {
            type: "string",
            description: "Fully qualified domain name.",
          },
        },
        required: ["domain"],
      },
  },
  {
    name: "domain_configure_ns",
    description: "Configure nameservers",
    inputSchema: {
        type: "object",
        properties: {
          "domain": {
            type: "string",
            description: "Fully qualified domain name.",
          },
        },
        required: ["domain"],
      },
  },
  {
    name: "domain_list_zones",
    description: "List zones | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "limit": {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
            description: "Number of zones per page (1–100, default 20).",
          },
          "page": {
            type: "integer",
            minimum: 1,
            default: 1,
            description: "Page number (1-based, default 1).",
          },
        },
      },
  },
  {
    name: "domain_create_zone",
    description: "Create zone | Price: $0.05",
    inputSchema: {
        type: "object",
        properties: {
          "domain": {
            type: "string",
            description: "Domain name for the zone.",
          },
        },
        required: ["domain"],
      },
  },
  {
    name: "domain_get_zone",
    description: "Get zone | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Zone ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "domain_delete_zone",
    description: "Delete zone | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Zone ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "domain_activate_zone",
    description: "Activate zone | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "Zone ID.",
          },
        },
        required: ["zone_id"],
      },
  },
  {
    name: "domain_verify_zone",
    description: "Verify zone propagation | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "Zone ID.",
          },
        },
        required: ["zone_id"],
      },
  },
  {
    name: "domain_setup_mail",
    description: "Setup mail DNS records | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "Zone ID.",
          },
          "mail_server": {
            type: "string",
            description: "Mail server hostname (e.g. \"mail.example.com\").",
          },
          "mail_server_ip": {
            type: "string",
            description: "Mail server IP address for the A record.",
          },
          "dkim": {
            type: "object",
            description: "Optional DKIM public keys.",
            properties: {
              "rsa": {
                type: "object",
                required: ["selector","public_key"],
                properties: {
                  "selector": {
                    type: "string",
                  },
                  "public_key": {
                    type: "string",
                  },
                },
              },
              "ed25519": {
                type: "object",
                required: ["selector","public_key"],
                properties: {
                  "selector": {
                    type: "string",
                  },
                  "public_key": {
                    type: "string",
                  },
                },
              },
            },
          },
        },
        required: ["zone_id","mail_server","mail_server_ip"],
      },
  },
  {
    name: "domain_batch_records",
    description: "Batch record operations | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "Zone ID.",
          },
          "create": {
            type: "array",
            items: {
              type: "object",
              required: ["type","name","content"],
              properties: {
                "type": {
                  type: "string",
                  enum: ["A","AAAA","CNAME","MX","TXT","SRV","CAA","NS"],
                },
                "name": {
                  type: "string",
                },
                "content": {
                  type: "string",
                },
                "ttl": {
                  type: "integer",
                },
                "proxied": {
                  type: "boolean",
                },
                "priority": {
                  type: "integer",
                },
              },
            },
          },
          "update": {
            type: "array",
            items: {
              type: "object",
              required: ["id"],
              properties: {
                "id": {
                  type: "string",
                },
                "type": {
                  type: "string",
                  enum: ["A","AAAA","CNAME","MX","TXT","SRV","CAA","NS"],
                },
                "name": {
                  type: "string",
                },
                "content": {
                  type: "string",
                },
                "ttl": {
                  type: "integer",
                },
                "proxied": {
                  type: "boolean",
                },
                "priority": {
                  type: "integer",
                },
              },
            },
          },
          "delete": {
            type: "array",
            items: {
              type: "object",
              required: ["id"],
              properties: {
                "id": {
                  type: "string",
                },
              },
            },
          },
        },
        required: ["zone_id"],
      },
  },
  {
    name: "domain_list_records",
    description: "List records | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "Zone ID.",
          },
        },
        required: ["zone_id"],
      },
  },
  {
    name: "domain_create_record",
    description: "Create record | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "Zone ID.",
          },
          "type": {
            type: "string",
            enum: ["A","AAAA","CNAME","MX","TXT","SRV","CAA","NS"],
            description: "DNS record type.",
          },
          "name": {
            type: "string",
            description: "Record name relative to zone root. Use \"@\" for root.",
          },
          "content": {
            type: "string",
            description: "Record content (IP for A/AAAA, hostname for CNAME/MX, text for TXT).",
          },
          "ttl": {
            type: "integer",
            description: "TTL in seconds. 1 = automatic.",
          },
          "proxied": {
            type: "boolean",
            description: "Proxy through Cloudflare (A/AAAA/CNAME only).",
          },
          "priority": {
            type: "integer",
            description: "Priority for MX/SRV records.",
          },
        },
        required: ["zone_id","type","name","content"],
      },
  },
  {
    name: "domain_get_record",
    description: "Get record | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "Zone ID.",
          },
          "id": {
            type: "string",
            description: "Record ID.",
          },
        },
        required: ["zone_id","id"],
      },
  },
  {
    name: "domain_update_record",
    description: "Update record | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "Zone ID.",
          },
          "id": {
            type: "string",
            description: "Record ID.",
          },
          "type": {
            type: "string",
            enum: ["A","AAAA","CNAME","MX","TXT","SRV","CAA","NS"],
          },
          "name": {
            type: "string",
          },
          "content": {
            type: "string",
          },
          "ttl": {
            type: "integer",
          },
          "proxied": {
            type: "boolean",
          },
          "priority": {
            type: "integer",
          },
        },
        required: ["zone_id","id"],
      },
  },
  {
    name: "domain_delete_record",
    description: "Delete record | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "zone_id": {
            type: "string",
            description: "Zone ID.",
          },
          "id": {
            type: "string",
            description: "Record ID.",
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
        url.searchParams.set("query", String(args.query));
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

      case "domain_register_domain": {
        const res = await primFetch(`${baseUrl}/v1/domains/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_recover_registration": {
        const res = await primFetch(`${baseUrl}/v1/domains/recover`, {
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

      case "domain_configure_ns": {
        const res = await primFetch(`${baseUrl}/v1/domains/${args.domain}/configure-ns`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_list_zones": {
        const url = new URL(`${baseUrl}/v1/zones`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.page !== undefined) url.searchParams.set("page", String(args.page));
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
