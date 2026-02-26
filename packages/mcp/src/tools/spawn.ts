import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const spawnTools: Tool[] = [
  {
    name: "spawn_server_create",
    description:
      "Provision a new VPS. Returns the server record and an action tracking provisioning. Poll spawn_server_get until status is 'running' to get the assigned IP. Limit: 3 concurrent servers per wallet. Only 'small' type available in beta.",
    inputSchema: {
      type: "object",
      required: ["name", "type", "image", "location"],
      properties: {
        name: {
          type: "string",
          description: "Server name (provider-level label).",
        },
        type: {
          type: "string",
          description: "Server type slug. Only 'small' is available in beta.",
          example: "small",
        },
        image: {
          type: "string",
          description: "OS image slug (e.g. 'ubuntu-24.04').",
        },
        location: {
          type: "string",
          description: "Data center location slug (e.g. 'nyc3').",
        },
        provider: {
          type: "string",
          description: "Cloud provider. Defaults to Hetzner.",
        },
        ssh_keys: {
          type: "array",
          items: { type: "string" },
          description: "Array of SSH key IDs (from spawn_ssh_key_create) to install.",
        },
        user_data: {
          type: "string",
          description: "Cloud-init user data script to run on first boot.",
        },
      },
    },
  },
  {
    name: "spawn_server_list",
    description:
      "List all servers owned by the authenticated wallet, paginated.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Number of servers to return (max 100).",
        },
        page: {
          type: "integer",
          minimum: 1,
          default: 1,
          description: "Page number (1-indexed).",
        },
      },
    },
  },
  {
    name: "spawn_server_get",
    description:
      "Get full details for a single server. Poll this after spawn_server_create until status is 'running' and public_net.ipv4.ip is non-null.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Prim server ID (e.g. 'srv_abc123').",
        },
      },
    },
  },
  {
    name: "spawn_server_delete",
    description:
      "Destroy the server and release its resources. Unused deposit is refunded. Server transitions to 'destroying' then 'deleted' status.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Prim server ID.",
        },
      },
    },
  },
  {
    name: "spawn_server_start",
    description: "Start a stopped server. Returns an action tracking the operation.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Prim server ID.",
        },
      },
    },
  },
  {
    name: "spawn_server_stop",
    description:
      "Stop a running server (graceful shutdown). Returns an action tracking the operation.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Prim server ID.",
        },
      },
    },
  },
  {
    name: "spawn_server_reboot",
    description: "Reboot a running server. Returns an action tracking the operation.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Prim server ID.",
        },
      },
    },
  },
  {
    name: "spawn_server_resize",
    description:
      "Change the server type (CPU/RAM). The server must be stopped first. Deposit delta is charged or refunded.",
    inputSchema: {
      type: "object",
      required: ["id", "type"],
      properties: {
        id: {
          type: "string",
          description: "Prim server ID.",
        },
        type: {
          type: "string",
          description: "Target server type slug.",
        },
        upgrade_disk: {
          type: "boolean",
          default: false,
          description: "Whether to upgrade the disk. Irreversible if true.",
        },
      },
    },
  },
  {
    name: "spawn_server_rebuild",
    description:
      "Reinstall the server from a fresh OS image. All data on the server is destroyed. Returns an action and optionally a new root password.",
    inputSchema: {
      type: "object",
      required: ["id", "image"],
      properties: {
        id: {
          type: "string",
          description: "Prim server ID.",
        },
        image: {
          type: "string",
          description: "OS image slug to rebuild with (e.g. 'debian-12').",
        },
      },
    },
  },
  {
    name: "spawn_ssh_key_create",
    description:
      "Register a public SSH key. The returned id can be passed in ssh_keys when creating a server.",
    inputSchema: {
      type: "object",
      required: ["name", "public_key"],
      properties: {
        name: {
          type: "string",
          description: "Human-readable label for this key.",
        },
        public_key: {
          type: "string",
          description: "The public key string (e.g. 'ssh-ed25519 AAAA...').",
        },
      },
    },
  },
  {
    name: "spawn_ssh_key_list",
    description:
      "List all SSH keys registered by the authenticated wallet.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "spawn_ssh_key_delete",
    description:
      "Remove an SSH key. Keys in use by active servers remain on those servers until rebuilt or manually removed.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Prim SSH key ID.",
        },
      },
    },
  },
];

export async function handleSpawnTool(
  name: string,
  args: Record<string, unknown>,
  primFetch: typeof fetch,
  baseUrl: string,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "spawn_server_create": {
        const res = await primFetch(`${baseUrl}/v1/servers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_server_list": {
        const url = new URL(`${baseUrl}/v1/servers`);
        if (args.limit) url.searchParams.set("limit", String(args.limit));
        if (args.page) url.searchParams.set("page", String(args.page));
        const res = await primFetch(url.toString());
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_server_get": {
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_server_delete": {
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_server_start": {
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}/start`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_server_stop": {
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}/stop`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_server_reboot": {
        const res = await primFetch(`${baseUrl}/v1/servers/${args.id}/reboot`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_server_resize": {
        const { id, ...body } = args;
        const res = await primFetch(`${baseUrl}/v1/servers/${id}/resize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_server_rebuild": {
        const { id, image } = args;
        const res = await primFetch(`${baseUrl}/v1/servers/${id}/rebuild`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_ssh_key_create": {
        const res = await primFetch(`${baseUrl}/v1/ssh-keys`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_ssh_key_list": {
        const res = await primFetch(`${baseUrl}/v1/ssh-keys`);
        const data = await res.json();
        if (!res.ok) return errorResult(data);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "spawn_ssh_key_delete": {
        const res = await primFetch(`${baseUrl}/v1/ssh-keys/${args.id}`, {
          method: "DELETE",
        });
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
