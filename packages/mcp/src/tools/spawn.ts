import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// BEGIN:GENERATED:TOOLS
export const spawnTools: Tool[] = [
  {
    name: "spawn_list_servers",
    description: "List servers | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "limit": {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
            description: "Number of servers to return. Max 100.",
          },
          "page": {
            type: "integer",
            minimum: 1,
            default: 1,
            description: "Page number (1-indexed).",
          },
        },
      },
  },
  {
    name: "spawn_create_server",
    description: "Create a server | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "name": {
            type: "string",
            description: "Server name (provider-level label).",
          },
          "type": {
            type: "string",
            description: "Server type slug. Only `small` is available in beta.",
          },
          "image": {
            type: "string",
            description: "OS image slug.",
          },
          "location": {
            type: "string",
            description: "Data center location slug.",
          },
          "provider": {
            type: "string",
            description: "Cloud provider. Defaults to Hetzner.",
          },
          "ssh_keys": {
            type: "array",
            items: {
              type: "string",
            },
            description: "Array of SSH key IDs (from `POST /v1/ssh-keys`) to install.",
          },
          "user_data": {
            type: "string",
            description: "Cloud-init user data script to run on first boot.",
          },
        },
        required: ["name","type","image","location"],
      },
  },
  {
    name: "spawn_get_server",
    description: "Get server | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Prim server ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "spawn_delete_server",
    description: "Delete server | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Prim server ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "spawn_start_server",
    description: "Start server | Price: $0.002",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Prim server ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "spawn_stop_server",
    description: "Stop server | Price: $0.002",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Prim server ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "spawn_reboot_server",
    description: "Reboot server | Price: $0.002",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Prim server ID.",
          },
        },
        required: ["id"],
      },
  },
  {
    name: "spawn_resize_server",
    description: "Resize server | Price: $0.01",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Prim server ID.",
          },
          "type": {
            type: "string",
            description: "Target server type slug.",
          },
          "upgrade_disk": {
            type: "boolean",
            description: "Whether to upgrade the disk alongside the CPU/RAM. Irreversible if true.",
            default: false,
          },
        },
        required: ["id","type"],
      },
  },
  {
    name: "spawn_rebuild_server",
    description: "Rebuild server | Price: $0.005",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Prim server ID.",
          },
          "image": {
            type: "string",
            description: "OS image slug to rebuild with.",
          },
        },
        required: ["id","image"],
      },
  },
  {
    name: "spawn_list_ssh_keys",
    description: "List SSH keys | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {},
      },
  },
  {
    name: "spawn_create_ssh_key",
    description: "Register SSH key | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "name": {
            type: "string",
            description: "Human-readable label for this key.",
          },
          "public_key": {
            type: "string",
            description: "The public key string (e.g. `ssh-ed25519 AAAA...`).",
          },
        },
        required: ["name","public_key"],
      },
  },
  {
    name: "spawn_delete_ssh_key",
    description: "Delete SSH key | Price: $0.001",
    inputSchema: {
        type: "object",
        properties: {
          "id": {
            type: "string",
            description: "Prim SSH key ID.",
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
