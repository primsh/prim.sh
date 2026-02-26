import { readFileSync } from "node:fs";
import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "./config.ts";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";

export function resolveSpawnUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_SPAWN_URL) return process.env.PRIM_SPAWN_URL;
  return "https://spawn.prim.sh";
}

async function handleError(res: Response): Promise<never> {
  let message = `HTTP ${res.status}`;
  let code = "unknown";
  try {
    const body = (await res.json()) as { error?: { code: string; message: string } };
    if (body.error) {
      message = body.error.message;
      code = body.error.code;
    }
  } catch {
    // ignore parse error
  }
  process.stderr.write(`Error: ${message} (${code})\n`);
  process.exit(1);
}

export async function runSpawnCommand(sub: string, argv: string[]): Promise<void> {
  const baseUrl = resolveSpawnUrl(argv);
  const walletFlag = getFlag("wallet", argv);
  const passphrase = await resolvePassphrase(argv);
  const maxPaymentFlag = getFlag("max-payment", argv);
  const quiet = hasFlag("quiet", argv);
  const config = await getConfig();
  const primFetch = createPrimFetch({
    keystore:
      walletFlag !== undefined || passphrase !== undefined
        ? { address: walletFlag, passphrase }
        : true,
    maxPayment: maxPaymentFlag ?? process.env.PRIM_MAX_PAYMENT ?? "1.00",
    network: config.network,
  });

  // Handle ssh-key subcommands
  if (sub === "ssh-key") {
    const sshSub = argv[2];
    switch (sshSub) {
      case "add": {
        const name = getFlag("name", argv);
        if (!name) {
          process.stderr.write("Usage: prim spawn ssh-key add --name NAME --public-key KEY|--file PATH\n");
          process.exit(1);
        }
        let publicKey = getFlag("public-key", argv);
        const filePath = getFlag("file", argv);
        if (filePath) {
          publicKey = readFileSync(filePath, "utf-8").trim();
        }
        if (!publicKey) {
          process.stderr.write("Usage: prim spawn ssh-key add --name NAME --public-key KEY|--file PATH\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/ssh-keys`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, public_key: publicKey }),
        });
        if (!res.ok) return handleError(res);
        const data = (await res.json()) as { id: string };
        if (quiet) {
          console.log(data.id);
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      case "ls": {
        const res = await primFetch(`${baseUrl}/v1/ssh-keys`);
        if (!res.ok) return handleError(res);
        const data = (await res.json()) as { ssh_keys: Array<{ id: string }> };
        if (quiet) {
          for (const k of data.ssh_keys) console.log(k.id);
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      case "rm": {
        const keyId = argv[3];
        if (!keyId) {
          process.stderr.write("Usage: prim spawn ssh-key rm KEY_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/ssh-keys/${keyId}`, {
          method: "DELETE",
        });
        if (!res.ok) return handleError(res);
        if (!quiet) {
          const data = await res.json();
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      default:
        console.log("Usage: prim spawn ssh-key <add|ls|rm>");
        process.exit(1);
    }
    return;
  }

  switch (sub) {
    case "create": {
      const name = getFlag("name", argv);
      if (!name) {
        process.stderr.write(
          "Usage: prim spawn create --name NAME --type TYPE --image IMAGE --location LOC [--ssh-keys IDS]\n",
        );
        process.exit(1);
      }
      const type = getFlag("type", argv) || "small";
      const image = getFlag("image", argv) || "ubuntu-24.04";
      const location = getFlag("location", argv) || "nyc3";
      const sshKeysRaw = getFlag("ssh-keys", argv);
      const reqBody: Record<string, unknown> = { name, type, image, location };
      if (sshKeysRaw) {
        reqBody.ssh_keys = sshKeysRaw.split(",");
      }
      const res = await primFetch(`${baseUrl}/v1/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { server: { id: string } };
      if (quiet) {
        console.log(data.server.id);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "ls": {
      const page = getFlag("page", argv) ?? "1";
      const perPage = getFlag("per-page", argv) ?? "20";
      const url = new URL(`${baseUrl}/v1/servers`);
      url.searchParams.set("page", page);
      url.searchParams.set("limit", perPage);
      const res = await primFetch(url.toString());
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { servers: Array<{ id: string }> };
      if (quiet) {
        for (const s of data.servers) console.log(s.id);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "get": {
      const serverId = argv[2];
      if (!serverId) {
        process.stderr.write("Usage: prim spawn get SERVER_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/servers/${serverId}`);
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as {
        id: string;
        status: string;
        image: string;
        created_at: string;
        public_net: { ipv4: { ip: string | null } | null };
      };
      if (quiet) {
        console.log(data.public_net?.ipv4?.ip ?? "");
      } else {
        const ip = data.public_net?.ipv4?.ip ?? "none";
        console.log(`Server ${data.id}`);
        console.log(`  Status:  ${data.status}`);
        console.log(`  IP:      ${ip}`);
        console.log(`  Image:   ${data.image}`);
        console.log(`  Created: ${data.created_at}`);
      }
      break;
    }

    case "rm": {
      const serverId = argv[2];
      if (!serverId) {
        process.stderr.write("Usage: prim spawn rm SERVER_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/servers/${serverId}`, {
        method: "DELETE",
      });
      if (!res.ok) return handleError(res);
      if (!quiet) {
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "reboot": {
      const serverId = argv[2];
      if (!serverId) {
        process.stderr.write("Usage: prim spawn reboot SERVER_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/servers/${serverId}/reboot`, {
        method: "POST",
      });
      if (!res.ok) return handleError(res);
      if (!quiet) {
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "stop": {
      const serverId = argv[2];
      if (!serverId) {
        process.stderr.write("Usage: prim spawn stop SERVER_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/servers/${serverId}/stop`, {
        method: "POST",
      });
      if (!res.ok) return handleError(res);
      if (!quiet) {
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "start": {
      const serverId = argv[2];
      if (!serverId) {
        process.stderr.write("Usage: prim spawn start SERVER_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/servers/${serverId}/start`, {
        method: "POST",
      });
      if (!res.ok) return handleError(res);
      if (!quiet) {
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    default:
      console.log("Usage: prim spawn <create|ls|get|rm|reboot|stop|start|ssh-key>");
      process.exit(1);
  }
}
