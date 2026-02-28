// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/spawn.yaml
// Regenerate: pnpm gen:mcp

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const spawnTools: Tool[] = [
  {
    name: "spawn_list_servers",
    description: "List all servers owned by the calling wallet | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "limit": {
            type: "integer",
            description: "1-100, default 20",
          },
          "page": {
            type: "integer",
            description: "1-based page number, default 1",
          },
        },
      },
  },
  {
    name: "spawn_create_server",
    description: "Provision a new VPS. Returns immediately with status 'initializing'. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "name": {
            type: "string",
            description: "Server name (provider-level label).",
          },
          "type": {
            type: "string",
            description: "Server type slug. Only \"small\" (2 vCPU, 4 GB RAM) available in beta.",
          },
          "image": {
            type: "string",
            description: "OS image slug (e.g. \"ubuntu-24.04\", \"debian-12\").",
          },
          "location": {
            type: "string",
            description: "Data center slug (e.g. \"nyc3\", \"sfo3\", \"lon1\").",
          },
          "provider": {
            type: "string",
            description: "Cloud provider. Default \"digitalocean\".",
          },
          "ssh_keys": {
            type: "array",
            items: {
              type: "string",
            },
            description: "SSH key IDs from POST /v1/ssh-keys to install on the server.",
          },
          "user_data": {
            type: "string",
            description: "Cloud-init script to run on first boot.",
          },
        },
        required: ["name","type","image","location"],
      },
  },
  {
    name: "spawn_get_server",
    description: "Get full details for a single server. Poll this until status='running'. | Price: $0.001",
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
    name: "spawn_delete_server",
    description: "Destroy a server and release its resources. Unused deposit is refunded. | Price: $0.005",
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
    name: "spawn_start_server",
    description: "Start a stopped server | Price: $0.002",
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
    name: "spawn_stop_server",
    description: "Stop a running server (graceful shutdown) | Price: $0.002",
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
    name: "spawn_reboot_server",
    description: "Reboot a running server | Price: $0.002",
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
    name: "spawn_resize_server",
    description: "Change server type (CPU/RAM). Server must be stopped first. Deposit adjusted. | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "type": {
            type: "string",
            description: "Target server type slug.",
          },
          "upgrade_disk": {
            type: "boolean",
            description: "Upgrade disk along with CPU/RAM. Irreversible if true. Default false.",
          },
        },
        required: ["id","type"],
      },
  },
  {
    name: "spawn_rebuild_server",
    description: "Reinstall from a fresh OS image. All data on server is destroyed. | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "id parameter",
          },
          "image": {
            type: "string",
            description: "OS image slug to rebuild with (e.g. \"debian-12\").",
          },
        },
        required: ["id","image"],
      },
  },
  {
    name: "spawn_list_ssh_keys",
    description: "List all SSH keys registered by the calling wallet | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
  {
    name: "spawn_create_ssh_key",
    description: "Register a public SSH key. Returned ID can be used in ssh_keys when creating a server. | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "name": {
            type: "string",
            description: "Human-readable label for this SSH key.",
          },
          "public_key": {
            type: "string",
            description: "Public key string (e.g. \"ssh-ed25519 AAAA...\").",
          },
        },
        required: ["name","public_key"],
      },
  },
  {
    name: "spawn_delete_ssh_key",
    description: "Remove an SSH key. Keys in use by active servers remain until server is rebuilt. | Price: $0.001",
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
export async function handleSpawnTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "spawn_list_servers": {
        const url = new URL(`${baseUrl}/v1/servers`);
        if (args.limit !== undefined) url.searchParams.set("limit", String(args.limit));
        if (args.page !== undefined) url.searchParams.set("page", String(args.page));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_create_server": {
        const res = await primFetch(`${baseUrl}/v1/servers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_get_server": {
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_delete_server": {
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_start_server": {
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}/start`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_stop_server": {
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}/stop`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_reboot_server": {
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}/reboot`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_resize_server": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}/resize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_rebuild_server": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}/rebuild`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_list_ssh_keys": {
        const res = await primFetch(`${baseUrl}/v1/ssh-keys`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_create_ssh_key": {
        const res = await primFetch(`${baseUrl}/v1/ssh-keys`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_delete_ssh_key": {
        const res = await primFetch(`${baseUrl}/v1/ssh-keys/${args.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown spawn tool: ${name}` }],
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
