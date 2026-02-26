import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const emailTools: Tool[] = [
  {
    name: "email_mailbox_create",
    description:
      "Create a new email mailbox. If username is omitted, a random one is generated. If domain is omitted, the shared default domain is used. Mailbox expires after ttl_ms milliseconds (default 7 days).",
    inputSchema: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description:
            "Desired local part of the email address (e.g. 'agent42'). Generated randomly if omitted.",
        },
        domain: {
          type: "string",
          description:
            "Email domain to use. Must be a verified custom domain or the shared default domain.",
        },
        ttl_ms: {
          type: "integer",
          description:
            "Mailbox lifetime in milliseconds. Defaults to 7 days (604800000).",
        },
      },
    },
  },
  {
    name: "email_mailbox_list",
    description:
      "List all email mailboxes owned by the authenticated wallet. Returns paginated results.",
    inputSchema: {
      type: "object",
      properties: {
        per_page: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of mailboxes per page (1-100, default 20).",
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
    name: "email_mailbox_get",
    description:
      "Get details for a single email mailbox including status and expiry time.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID (UUID).",
        },
      },
    },
  },
  {
    name: "email_mailbox_delete",
    description:
      "Permanently delete a mailbox and all its messages.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID (UUID).",
        },
      },
    },
  },
  {
    name: "email_mailbox_renew",
    description:
      "Extend the expiry time of a mailbox by ttl_ms milliseconds (default 7 days).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID (UUID).",
        },
        ttl_ms: {
          type: "integer",
          description:
            "Milliseconds to extend the mailbox TTL. Defaults to 7 days (604800000).",
        },
      },
    },
  },
  {
    name: "email_messages_list",
    description:
      "List messages in a mailbox, newest first. Use position for pagination.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID (UUID).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Maximum number of messages to return (1-100, default 20).",
        },
        position: {
          type: "integer",
          minimum: 0,
          default: 0,
          description: "Zero-based position offset to start from (default 0).",
        },
      },
    },
  },
  {
    name: "email_message_get",
    description:
      "Get the full content of a single email message including plain-text and HTML body.",
    inputSchema: {
      type: "object",
      required: ["id", "msgId"],
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID (UUID).",
        },
        msgId: {
          type: "string",
          description: "Message ID.",
        },
      },
    },
  },
  {
    name: "email_send",
    description:
      "Send an outbound email from a mailbox. Either body (plain text) or html must be provided.",
    inputSchema: {
      type: "object",
      required: ["id", "to", "subject"],
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID (UUID) to send from.",
        },
        to: {
          type: "string",
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
          description: "HTML message body. Can be provided alongside body for multipart messages.",
        },
        cc: {
          type: "string",
          description: "CC recipient email address.",
        },
        bcc: {
          type: "string",
          description: "BCC recipient email address.",
        },
      },
    },
  },
  {
    name: "email_webhook_create",
    description:
      "Register a webhook URL to receive notifications when messages arrive in a mailbox. Supported events: 'message.received'. If secret is provided, each delivery includes an X-Prim-Signature HMAC-SHA256 header.",
    inputSchema: {
      type: "object",
      required: ["id", "url"],
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID (UUID).",
        },
        url: {
          type: "string",
          description: "HTTPS URL to receive webhook events.",
        },
        secret: {
          type: "string",
          description: "Optional signing secret for HMAC-SHA256 signature verification.",
        },
        events: {
          type: "array",
          items: { type: "string" },
          description: "Event types to subscribe to. Defaults to all events. Example: ['message.received']",
        },
      },
    },
  },
  {
    name: "email_webhook_list",
    description:
      "List all registered webhooks for a mailbox.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID (UUID).",
        },
      },
    },
  },
  {
    name: "email_webhook_delete",
    description:
      "Remove a webhook registration from a mailbox.",
    inputSchema: {
      type: "object",
      required: ["id", "whId"],
      properties: {
        id: {
          type: "string",
          description: "Mailbox ID (UUID).",
        },
        whId: {
          type: "string",
          description: "Webhook ID.",
        },
      },
    },
  },
  {
    name: "email_domain_register",
    description:
      "Register a custom domain for use with email.prim.sh mailboxes. After registration, add the returned required_records DNS entries, then call email_domain_verify.",
    inputSchema: {
      type: "object",
      required: ["domain"],
      properties: {
        domain: {
          type: "string",
          description: "Domain name to register (e.g. 'example.com').",
        },
      },
    },
  },
  {
    name: "email_domain_list",
    description:
      "List all custom domains registered by the authenticated wallet.",
    inputSchema: {
      type: "object",
      properties: {
        per_page: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of domains per page (1-100, default 20).",
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
    name: "email_domain_get",
    description:
      "Get details for a single registered domain including verification status and required DNS records.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Domain ID.",
        },
      },
    },
  },
  {
    name: "email_domain_verify",
    description:
      "Check that the required DNS records are present for a domain. On success, status changes to 'verified' and dkim_records are returned for you to add.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Domain ID.",
        },
      },
    },
  },
  {
    name: "email_domain_delete",
    description:
      "Remove a custom domain registration. Mailboxes on this domain will stop receiving mail. Response includes a warning if active mailboxes exist.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Domain ID.",
        },
      },
    },
  },
];

export async function handleEmailTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "email_mailbox_create": {
        const body: Record<string, unknown> = {};
        if (args.username) body.username = args.username;
        if (args.domain) body.domain = args.domain;
        if (args.ttl_ms !== undefined) body.ttl_ms = args.ttl_ms;
        const res = await primFetch(`${baseUrl}/v1/mailboxes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_mailbox_list": {
        const url = new URL(`${baseUrl}/v1/mailboxes`);
        if (args.per_page) url.searchParams.set("per_page", String(args.per_page));
        if (args.page) url.searchParams.set("page", String(args.page));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_mailbox_get": {
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_mailbox_delete": {
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_mailbox_renew": {
        const body: Record<string, unknown> = {};
        if (args.ttl_ms !== undefined) body.ttl_ms = args.ttl_ms;
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}/renew`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_messages_list": {
        const url = new URL(`${baseUrl}/v1/mailboxes/${args.id}/messages`);
        if (args.limit) url.searchParams.set("limit", String(args.limit));
        if (args.position !== undefined) url.searchParams.set("position", String(args.position));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_message_get": {
        const res = await primFetch(
          `${baseUrl}/v1/mailboxes/${args.id}/messages/${args.msgId}`,
        );
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_send": {
        const { id, ...rest } = args as {
          id: string;
          to: string;
          subject: string;
          body?: string;
          html?: string;
          cc?: string;
          bcc?: string;
        };
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rest),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_webhook_create": {
        const { id, ...rest } = args as {
          id: string;
          url: string;
          secret?: string;
          events?: string[];
        };
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${id}/webhooks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rest),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_webhook_list": {
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${args.id}/webhooks`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_webhook_delete": {
        const res = await primFetch(
          `${baseUrl}/v1/mailboxes/${args.id}/webhooks/${args.whId}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_domain_register": {
        const res = await primFetch(`${baseUrl}/v1/domains`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: args.domain }),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_domain_list": {
        const url = new URL(`${baseUrl}/v1/domains`);
        if (args.per_page) url.searchParams.set("per_page", String(args.per_page));
        if (args.page) url.searchParams.set("page", String(args.page));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_domain_get": {
        const res = await primFetch(`${baseUrl}/v1/domains/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_domain_verify": {
        const res = await primFetch(`${baseUrl}/v1/domains/${args.id}/verify`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "email_domain_delete": {
        const res = await primFetch(`${baseUrl}/v1/domains/${args.id}`, {
          method: "DELETE",
        });
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
