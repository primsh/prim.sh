import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const domainTools: Tool[] = [
  {
    name: "domain_search",
    description:
      "Search domain availability and pricing. Pass a query (e.g. 'myagent') and optional TLDs. Returns availability and registration cost for each combination.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Domain name to search (without TLD, e.g. 'myagent').",
        },
        tlds: {
          type: "string",
          description: "Comma-separated TLDs to check (e.g. 'com,xyz,io'). Defaults to common TLDs.",
        },
      },
    },
  },
  {
    name: "domain_quote",
    description:
      "Get a time-limited price quote for registering a domain. Quote is valid for 15 minutes. Pass the returned quote_id to domain_register.",
    inputSchema: {
      type: "object",
      required: ["domain"],
      properties: {
        domain: {
          type: "string",
          description: "Fully qualified domain name to quote (e.g. 'myagent.com').",
        },
        years: {
          type: "integer",
          description: "Registration period in years (default 1).",
        },
      },
    },
  },
  {
    name: "domain_register",
    description:
      "Register a domain using a quote from domain_quote. Payment amount is taken from the quote (dynamic pricing). Returns zone_id, nameservers, and a recovery_token — store the recovery_token in case zone setup partially fails.",
    inputSchema: {
      type: "object",
      required: ["quote_id"],
      properties: {
        quote_id: {
          type: "string",
          description: "Quote ID from domain_quote. Valid for 15 minutes.",
        },
      },
    },
  },
  {
    name: "domain_recover",
    description:
      "Retry Cloudflare zone creation and nameserver configuration after a partial registration failure. Use the recovery_token from domain_register.",
    inputSchema: {
      type: "object",
      required: ["recovery_token"],
      properties: {
        recovery_token: {
          type: "string",
          description: "Recovery token from domain_register response.",
        },
      },
    },
  },
  {
    name: "domain_status",
    description:
      "Check the full post-registration pipeline status for a domain: zone creation, NS configuration, propagation, and activation. Poll this after registration to know when the domain is fully live (all_ready=true).",
    inputSchema: {
      type: "object",
      required: ["domain"],
      properties: {
        domain: {
          type: "string",
          description: "Fully qualified domain name (e.g. 'myagent.com').",
        },
      },
    },
  },
  {
    name: "domain_configure_ns",
    description:
      "Retry nameserver configuration at the registrar for a domain you registered. Use if ns_configured=false after domain_register.",
    inputSchema: {
      type: "object",
      required: ["domain"],
      properties: {
        domain: {
          type: "string",
          description: "Fully qualified domain name.",
        },
      },
    },
  },
  {
    name: "domain_zone_create",
    description:
      "Create a Cloudflare DNS zone for a domain. Returns nameservers to configure at your registrar. Use this when you already own the domain and want to manage DNS through domain.prim.sh.",
    inputSchema: {
      type: "object",
      required: ["domain"],
      properties: {
        domain: {
          type: "string",
          description: "Domain name for the zone (e.g. 'example.com').",
        },
      },
    },
  },
  {
    name: "domain_zone_list",
    description:
      "List all DNS zones owned by your wallet.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of zones per page (1-100, default 20).",
        },
        page: {
          type: "integer",
          minimum: 1,
          default: 1,
          description: "Page number (1-based, default 1).",
        },
      },
    },
  },
  {
    name: "domain_zone_get",
    description:
      "Get details for a single DNS zone including nameservers and activation status.",
    inputSchema: {
      type: "object",
      required: ["zone_id"],
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID.",
        },
      },
    },
  },
  {
    name: "domain_zone_delete",
    description:
      "Delete a Cloudflare DNS zone and all its records. This cannot be undone.",
    inputSchema: {
      type: "object",
      required: ["zone_id"],
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID.",
        },
      },
    },
  },
  {
    name: "domain_zone_activate",
    description:
      "Request Cloudflare to immediately re-check nameserver activation for a pending zone. Use this after configuring nameservers at your registrar to speed up activation.",
    inputSchema: {
      type: "object",
      required: ["zone_id"],
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID.",
        },
      },
    },
  },
  {
    name: "domain_zone_verify",
    description:
      "Check DNS propagation for a zone — verifies nameservers and all records are visible globally. Returns per-record propagation status.",
    inputSchema: {
      type: "object",
      required: ["zone_id"],
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID.",
        },
      },
    },
  },
  {
    name: "domain_zone_mail_setup",
    description:
      "Configure all DNS records required for email: MX, SPF (TXT), DMARC (TXT), and optionally DKIM (TXT). Also creates an A record for the mail server IP. Use after registering a custom domain with email.prim.sh.",
    inputSchema: {
      type: "object",
      required: ["zone_id", "mail_server", "mail_server_ip"],
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID.",
        },
        mail_server: {
          type: "string",
          description: "Mail server hostname (e.g. 'mail.example.com').",
        },
        mail_server_ip: {
          type: "string",
          description: "Mail server IP address for the A record.",
        },
        dkim_rsa_selector: {
          type: "string",
          description: "RSA DKIM selector (e.g. 'mail'). Required if providing dkim_rsa_public_key.",
        },
        dkim_rsa_public_key: {
          type: "string",
          description: "RSA DKIM public key.",
        },
        dkim_ed25519_selector: {
          type: "string",
          description: "Ed25519 DKIM selector. Required if providing dkim_ed25519_public_key.",
        },
        dkim_ed25519_public_key: {
          type: "string",
          description: "Ed25519 DKIM public key.",
        },
      },
    },
  },
  {
    name: "domain_record_create",
    description:
      "Create a single DNS record in a zone (A, AAAA, CNAME, MX, TXT, SRV, CAA, NS).",
    inputSchema: {
      type: "object",
      required: ["zone_id", "type", "name", "content"],
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID.",
        },
        type: {
          type: "string",
          enum: ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "NS"],
          description: "DNS record type.",
        },
        name: {
          type: "string",
          description: "Record name relative to zone root. Use '@' for root.",
        },
        content: {
          type: "string",
          description: "Record content (IP for A/AAAA, hostname for CNAME/MX, text for TXT).",
        },
        ttl: {
          type: "integer",
          description: "TTL in seconds. 1 = automatic (Cloudflare default).",
        },
        proxied: {
          type: "boolean",
          description: "Proxy traffic through Cloudflare. Valid for A/AAAA/CNAME only.",
        },
        priority: {
          type: "integer",
          description: "Priority for MX and SRV records.",
        },
      },
    },
  },
  {
    name: "domain_record_list",
    description:
      "List all DNS records in a zone.",
    inputSchema: {
      type: "object",
      required: ["zone_id"],
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID.",
        },
      },
    },
  },
  {
    name: "domain_record_get",
    description:
      "Get details for a single DNS record.",
    inputSchema: {
      type: "object",
      required: ["zone_id", "record_id"],
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID.",
        },
        record_id: {
          type: "string",
          description: "Record ID.",
        },
      },
    },
  },
  {
    name: "domain_record_update",
    description:
      "Update a DNS record. Only include fields to change — all fields are optional.",
    inputSchema: {
      type: "object",
      required: ["zone_id", "record_id"],
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID.",
        },
        record_id: {
          type: "string",
          description: "Record ID.",
        },
        type: {
          type: "string",
          enum: ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "NS"],
        },
        name: {
          type: "string",
        },
        content: {
          type: "string",
        },
        ttl: {
          type: "integer",
        },
        proxied: {
          type: "boolean",
        },
        priority: {
          type: "integer",
        },
      },
    },
  },
  {
    name: "domain_record_delete",
    description:
      "Delete a DNS record from a zone.",
    inputSchema: {
      type: "object",
      required: ["zone_id", "record_id"],
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID.",
        },
        record_id: {
          type: "string",
          description: "Record ID.",
        },
      },
    },
  },
  {
    name: "domain_record_batch",
    description:
      "Create, update, and delete DNS records in a single request. More efficient than individual calls when making multiple changes.",
    inputSchema: {
      type: "object",
      required: ["zone_id"],
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID.",
        },
        create: {
          type: "array",
          description: "Records to create.",
          items: {
            type: "object",
            required: ["type", "name", "content"],
            properties: {
              type: {
                type: "string",
                enum: ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "NS"],
              },
              name: { type: "string" },
              content: { type: "string" },
              ttl: { type: "integer" },
              proxied: { type: "boolean" },
              priority: { type: "integer" },
            },
          },
        },
        update: {
          type: "array",
          description: "Records to update (by id).",
          items: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
              type: {
                type: "string",
                enum: ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "NS"],
              },
              name: { type: "string" },
              content: { type: "string" },
              ttl: { type: "integer" },
              proxied: { type: "boolean" },
              priority: { type: "integer" },
            },
          },
        },
        delete: {
          type: "array",
          description: "Records to delete (by id).",
          items: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
            },
          },
        },
      },
    },
  },
];

export async function handleDomainTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "domain_search": {
        const url = new URL(`${baseUrl}/v1/domains/search`);
        url.searchParams.set("query", String(args.query));
        if (args.tlds) url.searchParams.set("tlds", String(args.tlds));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_quote": {
        const body: Record<string, unknown> = { domain: args.domain };
        if (args.years) body.years = args.years;
        const res = await primFetch(`${baseUrl}/v1/domains/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_register": {
        const res = await primFetch(`${baseUrl}/v1/domains/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quote_id: args.quote_id }),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_recover": {
        const res = await primFetch(`${baseUrl}/v1/domains/recover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recovery_token: args.recovery_token }),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_status": {
        const res = await primFetch(`${baseUrl}/v1/domains/${args.domain}/status`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_configure_ns": {
        const res = await primFetch(`${baseUrl}/v1/domains/${args.domain}/configure-ns`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_zone_create": {
        const res = await primFetch(`${baseUrl}/v1/zones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: args.domain }),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_zone_list": {
        const url = new URL(`${baseUrl}/v1/zones`);
        if (args.limit) url.searchParams.set("limit", String(args.limit));
        if (args.page) url.searchParams.set("page", String(args.page));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_zone_get": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_zone_delete": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_zone_activate": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/activate`, {
          method: "PUT",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_zone_verify": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/verify`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_zone_mail_setup": {
        const body: Record<string, unknown> = {
          mail_server: args.mail_server,
          mail_server_ip: args.mail_server_ip,
        };
        if (args.dkim_rsa_selector && args.dkim_rsa_public_key) {
          const dkim: Record<string, unknown> = {
            rsa: { selector: args.dkim_rsa_selector, public_key: args.dkim_rsa_public_key },
          };
          if (args.dkim_ed25519_selector && args.dkim_ed25519_public_key) {
            dkim.ed25519 = { selector: args.dkim_ed25519_selector, public_key: args.dkim_ed25519_public_key };
          }
          body.dkim = dkim;
        }
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/mail-setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_record_create": {
        const body: Record<string, unknown> = {
          type: args.type,
          name: args.name,
          content: args.content,
        };
        if (args.ttl !== undefined) body.ttl = args.ttl;
        if (args.proxied !== undefined) body.proxied = args.proxied;
        if (args.priority !== undefined) body.priority = args.priority;
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_record_list": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_record_get": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records/${args.record_id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_record_update": {
        const body: Record<string, unknown> = {};
        if (args.type !== undefined) body.type = args.type;
        if (args.name !== undefined) body.name = args.name;
        if (args.content !== undefined) body.content = args.content;
        if (args.ttl !== undefined) body.ttl = args.ttl;
        if (args.proxied !== undefined) body.proxied = args.proxied;
        if (args.priority !== undefined) body.priority = args.priority;
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records/${args.record_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_record_delete": {
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records/${args.record_id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "domain_record_batch": {
        const body: Record<string, unknown> = {};
        if (args.create) body.create = args.create;
        if (args.update) body.update = args.update;
        if (args.delete) body.delete = args.delete;
        const res = await primFetch(`${baseUrl}/v1/zones/${args.zone_id}/records/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
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
