// SPDX-License-Identifier: Apache-2.0
// AI SDK tool definitions for prim primitives.
// Each tool wraps a prim API call with x402 payment via the user's custodial wallet.
import { jsonSchema, tool } from "ai";

const PRIM_BASE = process.env.PRIM_BASE_URL ?? "https://{service}.prim.sh";

function primUrl(service: string, path: string): string {
  return `${PRIM_BASE.replace("{service}", service)}${path}`;
}

/**
 * Creates all prim tools bound to a specific x402-authenticated fetch.
 * `primFetch` must be pre-configured with the user's decrypted wallet key.
 */
export function createPrimTools(primFetch: typeof fetch) {
  return {
    // ─── Spawn (VPS) ──────────────────────────────────────────────
    spawn_create_server: tool({
      description: "Create a new VPS server. Returns server ID, IP, and status.",
      inputSchema: jsonSchema<{
        name: string;
        server_type?: string;
        image?: string;
        location?: string;
      }>({
        type: "object",
        properties: {
          name: { type: "string", description: "Server name" },
          server_type: { type: "string", description: "Server type (e.g. cx22). Default: cx22" },
          image: {
            type: "string",
            description: "OS image (e.g. ubuntu-24.04). Default: ubuntu-24.04",
          },
          location: { type: "string", description: "Location (e.g. nbg1). Default: nbg1" },
        },
        required: ["name"],
      }),
      execute: async (args: {
        name: string;
        server_type?: string;
        image?: string;
        location?: string;
      }) => {
        const res = await primFetch(primUrl("spawn", "/v1/servers"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        return (await res.json()) as Record<string, unknown>;
      },
    }),

    spawn_get_server: tool({
      description: "Get details about a VPS server by ID.",
      inputSchema: jsonSchema<{ server_id: string }>({
        type: "object",
        properties: { server_id: { type: "string", description: "Server ID" } },
        required: ["server_id"],
      }),
      execute: async (args: { server_id: string }) => {
        const res = await primFetch(primUrl("spawn", `/v1/servers/${args.server_id}`));
        return (await res.json()) as Record<string, unknown>;
      },
    }),

    spawn_delete_server: tool({
      description: "Delete a VPS server by ID.",
      inputSchema: jsonSchema<{ server_id: string }>({
        type: "object",
        properties: { server_id: { type: "string", description: "Server ID" } },
        required: ["server_id"],
      }),
      execute: async (args: { server_id: string }) => {
        const res = await primFetch(primUrl("spawn", `/v1/servers/${args.server_id}`), {
          method: "DELETE",
        });
        return (await res.json()) as Record<string, unknown>;
      },
    }),

    // ─── Search ───────────────────────────────────────────────────
    search_web: tool({
      description: "Search the web. Returns search results with titles, URLs, and snippets.",
      inputSchema: jsonSchema<{ query: string; limit?: number }>({
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default 5)" },
        },
        required: ["query"],
      }),
      execute: async (args: { query: string; limit?: number }) => {
        const res = await primFetch(primUrl("search", "/v1/search"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        return (await res.json()) as Record<string, unknown>;
      },
    }),

    // ─── Store (Object Storage) ───────────────────────────────────
    store_put: tool({
      description: "Upload an object to storage. Returns object metadata.",
      inputSchema: jsonSchema<{
        bucket_id: string;
        key: string;
        content: string;
        content_type?: string;
      }>({
        type: "object",
        properties: {
          bucket_id: { type: "string", description: "Bucket ID" },
          key: { type: "string", description: "Object key/path" },
          content: { type: "string", description: "Content to store" },
          content_type: { type: "string", description: "MIME type (default text/plain)" },
        },
        required: ["bucket_id", "key", "content"],
      }),
      execute: async (args: {
        bucket_id: string;
        key: string;
        content: string;
        content_type?: string;
      }) => {
        const res = await primFetch(
          primUrl("store", `/v1/buckets/${args.bucket_id}/objects/${args.key}`),
          {
            method: "PUT",
            headers: { "Content-Type": args.content_type ?? "text/plain" },
            body: args.content,
          },
        );
        return (await res.json()) as Record<string, unknown>;
      },
    }),

    store_get: tool({
      description: "Download an object from storage.",
      inputSchema: jsonSchema<{ bucket_id: string; key: string }>({
        type: "object",
        properties: {
          bucket_id: { type: "string", description: "Bucket ID" },
          key: { type: "string", description: "Object key/path" },
        },
        required: ["bucket_id", "key"],
      }),
      execute: async (args: { bucket_id: string; key: string }) => {
        const res = await primFetch(
          primUrl("store", `/v1/buckets/${args.bucket_id}/objects/${args.key}`),
        );
        if (res.headers.get("content-type")?.startsWith("application/json")) {
          return (await res.json()) as Record<string, unknown>;
        }
        return { content: await res.text() };
      },
    }),

    // ─── Email ────────────────────────────────────────────────────
    email_create_mailbox: tool({
      description: "Create a new email mailbox. Returns mailbox address and credentials.",
      inputSchema: jsonSchema<{ local_part: string; domain?: string }>({
        type: "object",
        properties: {
          local_part: {
            type: "string",
            description: "Local part of the email address (before @)",
          },
          domain: { type: "string", description: "Domain (default: mail.prim.sh)" },
        },
        required: ["local_part"],
      }),
      execute: async (args: { local_part: string; domain?: string }) => {
        const res = await primFetch(primUrl("email", "/v1/mailboxes"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        return (await res.json()) as Record<string, unknown>;
      },
    }),

    email_send: tool({
      description: "Send an email from a mailbox.",
      inputSchema: jsonSchema<{
        mailbox_id: string;
        to: string;
        subject: string;
        body: string;
        content_type?: string;
      }>({
        type: "object",
        properties: {
          mailbox_id: { type: "string", description: "Mailbox ID" },
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body" },
          content_type: {
            type: "string",
            description: "Body content type (text/plain or text/html)",
          },
        },
        required: ["mailbox_id", "to", "subject", "body"],
      }),
      execute: async (args: {
        mailbox_id: string;
        to: string;
        subject: string;
        body: string;
        content_type?: string;
      }) => {
        const res = await primFetch(primUrl("email", `/v1/mailboxes/${args.mailbox_id}/send`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: args.to,
            subject: args.subject,
            body: args.body,
            content_type: args.content_type,
          }),
        });
        return (await res.json()) as Record<string, unknown>;
      },
    }),

    email_list: tool({
      description: "List emails in a mailbox.",
      inputSchema: jsonSchema<{ mailbox_id: string; limit?: number }>({
        type: "object",
        properties: {
          mailbox_id: { type: "string", description: "Mailbox ID" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: ["mailbox_id"],
      }),
      execute: async (args: { mailbox_id: string; limit?: number }) => {
        const params = new URLSearchParams();
        if (args.limit) params.set("limit", String(args.limit));
        const res = await primFetch(
          primUrl("email", `/v1/mailboxes/${args.mailbox_id}/messages?${params}`),
        );
        return (await res.json()) as Record<string, unknown>;
      },
    }),

    // ─── Domain ───────────────────────────────────────────────────
    domain_create_zone: tool({
      description: "Register a DNS zone for a domain.",
      inputSchema: jsonSchema<{ domain: string }>({
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain name (e.g. example.com)" },
        },
        required: ["domain"],
      }),
      execute: async (args: { domain: string }) => {
        const res = await primFetch(primUrl("domain", "/v1/zones"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        return (await res.json()) as Record<string, unknown>;
      },
    }),

    domain_create_record: tool({
      description: "Create a DNS record in a zone.",
      inputSchema: jsonSchema<{
        zone_id: string;
        type: string;
        name: string;
        content: string;
        ttl?: number;
      }>({
        type: "object",
        properties: {
          zone_id: { type: "string", description: "Zone ID" },
          type: { type: "string", description: "Record type (A, AAAA, CNAME, MX, TXT)" },
          name: { type: "string", description: "Record name (e.g. @ or subdomain)" },
          content: { type: "string", description: "Record value" },
          ttl: { type: "number", description: "TTL in seconds (default 3600)" },
        },
        required: ["zone_id", "type", "name", "content"],
      }),
      execute: async (args: {
        zone_id: string;
        type: string;
        name: string;
        content: string;
        ttl?: number;
      }) => {
        const res = await primFetch(primUrl("domain", `/v1/zones/${args.zone_id}/records`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: args.type,
            name: args.name,
            content: args.content,
            ttl: args.ttl,
          }),
        });
        return (await res.json()) as Record<string, unknown>;
      },
    }),

    domain_verify: tool({
      description: "Check DNS propagation for a domain.",
      inputSchema: jsonSchema<{ zone_id: string }>({
        type: "object",
        properties: {
          zone_id: { type: "string", description: "Zone ID" },
        },
        required: ["zone_id"],
      }),
      execute: async (args: { zone_id: string }) => {
        const res = await primFetch(primUrl("domain", `/v1/zones/${args.zone_id}/verify`), {
          method: "POST",
        });
        return (await res.json()) as Record<string, unknown>;
      },
    }),

    // ─── Wallet ───────────────────────────────────────────────────
    wallet_balance: tool({
      description: "Check USDC and ETH balance of a wallet address.",
      inputSchema: jsonSchema<{ address?: string }>({
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Wallet address (default: your own wallet)",
          },
        },
      }),
      execute: async (args: { address?: string }) => {
        const params = args.address ? `?address=${args.address}` : "";
        const res = await primFetch(primUrl("wallet", `/v1/balance${params}`));
        return (await res.json()) as Record<string, unknown>;
      },
    }),
  };
}
