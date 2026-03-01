// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/email.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const emailTools: Tool[] = [
  {
    name: "email_list_mailboxes",
    description: "List mailboxes owned by the calling wallet (paginated) | Price: $0.001",
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
    name: "email_create_mailbox",
    description: "Create a mailbox. Optional: username, domain, ttl_ms. | Price: $0.05",
    inputSchema: {
        type: "object",
        properties: {
          "username": {
            type: "string",
            description: "Desired username. Omit for random generation.",
          },
          "domain": {
            type: "string",
            description: "Domain for the mailbox (must be registered). Omit for default domain.",
          },
          "ttl_ms": {
            type: "number",
            description: "TTL in milliseconds. Omit for permanent mailbox.",
          },
        },
      },
  },
  {
    name: "email_get_mailbox",
    description: "Get mailbox metadata including expires_at | Price: $0.001",
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
    name: "email_delete_mailbox",
    description: "Permanently delete a mailbox and all messages | Price: $0.01",
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
    name: "email_renew_mailbox",
    description: "Extend mailbox TTL by ttl_ms milliseconds | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "ttl_ms": {
            type: "number",
            description: "Extension duration in milliseconds. Omit to apply default TTL.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "email_list_messages",
    description: "List messages in a mailbox, newest first | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "limit": {
            type: "integer",
            description: "1-100, default 20",
          },
          "after": {
            type: "integer",
            description: "Position-based cursor for pagination",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "email_get_message",
    description: "Get full message including textBody and htmlBody | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "msgId": {
            type: "string",
            description: "msgId parameter",
          },
        },
        required: ["id","msgId"],
      },
  },
  {
    name: "email_send_message",
    description: "Send email from a mailbox. Requires to, subject, and body or html. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "to": {
            type: "string",
            description: "Recipient email address.",
          },
          "subject": {
            type: "string",
            description: "Email subject line.",
          },
          "body": {
            type: "string",
            description: "Plain-text body. Either body or html is required.",
          },
          "html": {
            type: "string",
            description: "HTML body. Either body or html is required.",
          },
          "cc": {
            type: "string",
            description: "CC recipient email address.",
          },
          "bcc": {
            type: "string",
            description: "BCC recipient email address.",
          },
        },
        required: ["id","to","subject"],
      },
  },
  {
    name: "email_list_webhooks",
    description: "List webhooks for a mailbox | Price: $0.001",
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
    name: "email_register_webhook",
    description: "Register a webhook URL for message.received events. Optional secret for HMAC signing. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "url": {
            type: "string",
            description: "HTTPS URL to receive webhook POST requests.",
          },
          "secret": {
            type: "string",
            description: "HMAC secret for X-Prim-Signature verification.",
          },
          "events": {
            type: "array",
            items: {
              type: "string",
            },
            description: "Events to subscribe to. Defaults to [\"message.received\"].",
          },
        },
        required: ["id","url"],
      },
  },
  {
    name: "email_delete_webhook",
    description: "Delete a webhook | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "whId": {
            type: "string",
            description: "whId parameter",
          },
        },
        required: ["id","whId"],
      },
  },
  {
    name: "email_list_domains",
    description: "List registered custom domains (paginated) | Price: $0.001",
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
    name: "email_register_domain",
    description: "Register a custom domain. Returns required_records for DNS. | Price: $0.05",
    inputSchema: {
        type: "object",
        properties: {
          "domain": {
            type: "string",
            description: "Domain name to register (e.g. \"myproject.com\").",
          },
        },
        required: ["domain"],
      },
  },
  {
    name: "email_get_domain",
    description: "Get domain details and verification status | Price: $0.001",
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
    name: "email_delete_domain",
    description: "Remove a custom domain registration | Price: $0.01",
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
    name: "email_verify_domain",
    description: "Verify DNS records. On success: status → verified, dkim_records returned. | Price: $0.01",
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
];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export async function handleEmailTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "email_list_mailboxes": {
        const url = new URL(`${baseUrl}/v1/mailboxes`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.after !== undefined) url.searchParams.set("after", String(args.after));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_create_mailbox": {
        const res = await primFetch(`${baseUrl}/v1/mailboxes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_get_mailbox": {
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_delete_mailbox": {
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_renew_mailbox": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}/renew`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_list_messages": {
        const url = new URL(`${baseUrl}/v1/mailboxes/${args.id}/messages`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.after !== undefined) url.searchParams.set("after", String(args.after));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_get_message": {
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}/messages/${args.msgId}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_send_message": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_list_webhooks": {
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}/webhooks`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_register_webhook": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}/webhooks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_delete_webhook": {
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}/webhooks/${args.whId}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_list_domains": {
        const url = new URL(`${baseUrl}/v1/domains`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.after !== undefined) url.searchParams.set("after", String(args.after));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_register_domain": {
        const res = await primFetch(`${baseUrl}/v1/domains`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_get_domain": {
        const res = await primFetch(`${baseUrl}/v1/domains/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_delete_domain": {
        const res = await primFetch(`${baseUrl}/v1/domains/${args.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_verify_domain": {
        const res = await primFetch(`${baseUrl}/v1/domains/${args.id}/verify`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown email tool: ${name}` }],
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
