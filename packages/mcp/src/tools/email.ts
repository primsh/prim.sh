import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const emailTools: Tool[] = [
  {
    name: "email_list_mailboxes",
    description: "List mailboxes | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of mailboxes per page (1–100, default 20).",
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
    name: "email_create_mailbox",
    description: "Create a mailbox | Price: $0.05",
    inputSchema: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "Desired local part of the email address. Generated randomly if omitted.",
        },
        domain: {
          type: "string",
          description:
            "Email domain to use. Must be a verified custom domain or the shared default domain.",
        },
        ttl_ms: {
          type: "integer",
          description:
            "Mailbox lifetime in milliseconds. Defaults to 7 days (604800000). Pass null for no expiry.",
        },
      },
    },
  },
  {
    name: "email_get_mailbox",
    description: "Get mailbox details | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "email_delete_mailbox",
    description: "Delete a mailbox | Price: $0.01",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "email_renew_mailbox",
    description: "Renew mailbox TTL | Price: $0.01",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID.",
        },
        ttl_ms: {
          type: "integer",
          description:
            "Additional milliseconds to extend the mailbox TTL. Defaults to 7 days (604800000).",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "email_list_messages",
    description: "List messages in a mailbox | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Maximum number of messages to return (1–100, default 20).",
        },
        position: {
          type: "integer",
          minimum: 0,
          default: 0,
          description: "Zero-based position offset to start from (default 0).",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "email_get_message",
    description: "Get message detail | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID.",
        },
        msgId: {
          type: "string",
          description: "Message ID.",
        },
      },
      required: ["id", "msgId"],
    },
  },
  {
    name: "email_send_message",
    description: "Send email from a mailbox | Price: $0.01",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID.",
        },
        to: {
          type: "string",
          format: "email",
          description: "Recipient email address.",
        },
        subject: {
          type: "string",
          description: "Email subject line.",
        },
        body: {
          type: "string",
          description: "Plain-text message body.",
        },
        html: {
          type: "string",
          description:
            "HTML message body. Can be provided alongside `body` for multipart messages.",
        },
        cc: {
          type: "string",
          format: "email",
          description: "CC recipient email address.",
        },
        bcc: {
          type: "string",
          format: "email",
          description: "BCC recipient email address.",
        },
      },
      required: ["id", "to", "subject"],
    },
  },
  {
    name: "email_list_webhooks",
    description: "List webhooks for a mailbox | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "email_register_webhook",
    description: "Register a webhook | Price: $0.01",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID.",
        },
        url: {
          type: "string",
          format: "uri",
          description: "HTTPS URL to receive webhook events.",
        },
        secret: {
          type: "string",
          description: "Optional signing secret. Used to generate HMAC-SHA256 signatures.",
        },
        events: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Event types to subscribe to. Defaults to all events.",
        },
      },
      required: ["id", "url"],
    },
  },
  {
    name: "email_delete_webhook",
    description: "Delete a webhook | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID.",
        },
        whId: {
          type: "string",
          description: "Webhook ID.",
        },
      },
      required: ["id", "whId"],
    },
  },
  {
    name: "email_list_domains",
    description: "List registered domains | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of domains per page (1–100, default 20).",
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
    name: "email_register_domain",
    description: "Register an email domain | Price: $0.05",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: 'Domain name to register (e.g. "example.com").',
        },
      },
      required: ["domain"],
    },
  },
  {
    name: "email_get_domain",
    description: "Get domain details | Price: $0.001",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Domain ID.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "email_delete_domain",
    description: "Delete a domain | Price: $0.01",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Domain ID.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "email_verify_domain",
    description: "Verify domain ownership | Price: $0.01",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Domain ID.",
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
        if (args.page !== undefined) url.searchParams.set("page", String(args.page));
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
        if (args.position !== undefined) url.searchParams.set("position", String(args.position));
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
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}/webhooks/${args.whId}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_list_domains": {
        const url = new URL(`${baseUrl}/v1/domains`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.page !== undefined) url.searchParams.set("page", String(args.page));
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
