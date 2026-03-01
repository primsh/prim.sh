// SPDX-License-Identifier: Apache-2.0
import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "@primsh/keystore";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";

export function resolveDomainUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_DOMAIN_URL) return process.env.PRIM_DOMAIN_URL;
  return "https://domain.prim.sh";
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
  throw new Error(`${message} (${code})`);
}

export async function runDomainCommand(sub: string, argv: string[]): Promise<void> {
  const baseUrl = resolveDomainUrl(argv);
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
    maxPayment: maxPaymentFlag ?? process.env.PRIM_MAX_PAYMENT ?? "100.00",
    network: config.network,
  });

  // Handle zone subcommands
  if (sub === "zone") {
    const zoneSub = argv[2];
    switch (zoneSub) {
      case "create": {
        const zone = getFlag("zone", argv);
        if (!zone) {
          process.stderr.write("Usage: prim domain zone create --zone DOMAIN\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/zones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: zone }),
        });
        if (!res.ok) return handleError(res);
        const data = (await res.json()) as { zone: { id: string; name_servers: string[] } };
        if (quiet) {
          console.log(data.zone.id);
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      case "ls": {
        const page = getFlag("page", argv) ?? "1";
        const limit = getFlag("limit", argv) ?? "20";
        const url = new URL(`${baseUrl}/v1/zones`);
        url.searchParams.set("page", page);
        url.searchParams.set("limit", limit);
        const res = await primFetch(url.toString());
        if (!res.ok) return handleError(res);
        const data = (await res.json()) as {
          zones: Array<{ id: string; domain: string; status: string }>;
        };
        if (quiet) {
          for (const z of data.zones) console.log(z.id);
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      case "get": {
        const zoneId = argv[3];
        if (!zoneId) {
          process.stderr.write("Usage: prim domain zone get ZONE_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/zones/${zoneId}`);
        if (!res.ok) return handleError(res);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      case "rm": {
        const zoneId = argv[3];
        if (!zoneId) {
          process.stderr.write("Usage: prim domain zone rm ZONE_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/zones/${zoneId}`, { method: "DELETE" });
        if (!res.ok) return handleError(res);
        if (!quiet) {
          const data = await res.json();
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      case "verify": {
        const zoneId = argv[3];
        if (!zoneId) {
          process.stderr.write("Usage: prim domain zone verify ZONE_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/zones/${zoneId}/verify`);
        if (!res.ok) return handleError(res);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      case "activate": {
        const zoneId = argv[3];
        if (!zoneId) {
          process.stderr.write("Usage: prim domain zone activate ZONE_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/zones/${zoneId}/activate`, { method: "PUT" });
        if (!res.ok) return handleError(res);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      case "mail-setup": {
        const zoneId = argv[3];
        if (!zoneId) {
          process.stderr.write(
            "Usage: prim domain zone mail-setup ZONE_ID --mail-server HOSTNAME --mail-server-ip IP [--dkim-rsa-selector SEL --dkim-rsa-key KEY]\n",
          );
          process.exit(1);
        }
        const mailServer = getFlag("mail-server", argv);
        const mailServerIp = getFlag("mail-server-ip", argv);
        if (!mailServer || !mailServerIp) {
          process.stderr.write(
            "Usage: prim domain zone mail-setup ZONE_ID --mail-server HOSTNAME --mail-server-ip IP\n",
          );
          process.exit(1);
        }
        const body: Record<string, unknown> = {
          mail_server: mailServer,
          mail_server_ip: mailServerIp,
        };
        const dkimRsaSel = getFlag("dkim-rsa-selector", argv);
        const dkimRsaKey = getFlag("dkim-rsa-key", argv);
        const dkimEd25519Sel = getFlag("dkim-ed25519-selector", argv);
        const dkimEd25519Key = getFlag("dkim-ed25519-key", argv);
        if (dkimRsaSel && dkimRsaKey) {
          const dkim: Record<string, unknown> = {
            rsa: { selector: dkimRsaSel, public_key: dkimRsaKey },
          };
          if (dkimEd25519Sel && dkimEd25519Key) {
            dkim.ed25519 = { selector: dkimEd25519Sel, public_key: dkimEd25519Key };
          }
          body.dkim = dkim;
        }
        const res = await primFetch(`${baseUrl}/v1/zones/${zoneId}/mail-setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) return handleError(res);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      default:
        console.log("Usage: prim domain zone <create|ls|get|rm|verify|activate|mail-setup>");
        process.exit(1);
    }
    return;
  }

  // Handle record subcommands
  if (sub === "record") {
    const recordSub = argv[2];
    switch (recordSub) {
      case "add": {
        const zoneId = argv[3];
        if (!zoneId) {
          process.stderr.write(
            "Usage: prim domain record add ZONE_ID --type TYPE --name NAME --content CONTENT [--ttl TTL] [--proxied] [--priority N]\n",
          );
          process.exit(1);
        }
        const type = getFlag("type", argv);
        const recName = getFlag("name", argv);
        const content = getFlag("content", argv);
        if (!type || !recName || !content) {
          process.stderr.write(
            "Usage: prim domain record add ZONE_ID --type TYPE --name NAME --content CONTENT\n",
          );
          process.exit(1);
        }
        const body: Record<string, unknown> = { type, name: recName, content };
        const ttl = getFlag("ttl", argv);
        if (ttl) body.ttl = Number(ttl);
        if (hasFlag("proxied", argv)) body.proxied = true;
        const priority = getFlag("priority", argv);
        if (priority) body.priority = Number(priority);
        const res = await primFetch(`${baseUrl}/v1/zones/${zoneId}/records`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
        const zoneId = argv[3];
        if (!zoneId) {
          process.stderr.write("Usage: prim domain record ls ZONE_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/zones/${zoneId}/records`);
        if (!res.ok) return handleError(res);
        const data = (await res.json()) as {
          records: Array<{ id: string; type: string; name: string; content: string }>;
        };
        if (quiet) {
          for (const r of data.records) console.log(r.id);
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      case "get": {
        const zoneId = argv[3];
        const recordId = argv[4];
        if (!zoneId || !recordId) {
          process.stderr.write("Usage: prim domain record get ZONE_ID RECORD_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/zones/${zoneId}/records/${recordId}`);
        if (!res.ok) return handleError(res);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      case "update": {
        const zoneId = argv[3];
        const recordId = argv[4];
        if (!zoneId || !recordId) {
          process.stderr.write(
            "Usage: prim domain record update ZONE_ID RECORD_ID [--type TYPE] [--name NAME] [--content CONTENT] [--ttl TTL] [--proxied] [--priority N]\n",
          );
          process.exit(1);
        }
        const body: Record<string, unknown> = {};
        const type = getFlag("type", argv);
        if (type) body.type = type;
        const recName = getFlag("name", argv);
        if (recName) body.name = recName;
        const content = getFlag("content", argv);
        if (content) body.content = content;
        const ttl = getFlag("ttl", argv);
        if (ttl) body.ttl = Number(ttl);
        if (hasFlag("proxied", argv)) body.proxied = true;
        const priority = getFlag("priority", argv);
        if (priority) body.priority = Number(priority);
        const res = await primFetch(`${baseUrl}/v1/zones/${zoneId}/records/${recordId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) return handleError(res);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      case "rm": {
        const zoneId = argv[3];
        const recordId = argv[4];
        if (!zoneId || !recordId) {
          process.stderr.write("Usage: prim domain record rm ZONE_ID RECORD_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/zones/${zoneId}/records/${recordId}`, {
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
        console.log("Usage: prim domain record <add|ls|get|update|rm>");
        process.exit(1);
    }
    return;
  }

  switch (sub) {
    case "search": {
      const query = argv[2];
      if (!query) {
        process.stderr.write("Usage: prim domain search QUERY [--tlds com,xyz,...]\n");
        process.exit(1);
      }
      const tldsFlag = getFlag("tlds", argv);
      const url = new URL(`${baseUrl}/v1/domains/search`);
      url.searchParams.set("query", query);
      if (tldsFlag) url.searchParams.set("tlds", tldsFlag);
      const res = await primFetch(url.toString());
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as {
        results: Array<{
          domain: string;
          available: boolean;
          price?: { register: number; currency: string };
          premium?: boolean;
        }>;
      };
      if (quiet) {
        for (const r of data.results) {
          if (r.available) console.log(r.domain);
        }
      } else {
        const available = data.results.filter((r) => r.available);
        if (available.length === 0) {
          console.log("No available domains found.");
        } else {
          console.log(`${"DOMAIN".padEnd(35)} ${"PRICE".padEnd(12)} PREMIUM`);
          for (const r of available) {
            const price = r.price ? `$${r.price.register.toFixed(2)}` : "unknown";
            const premium = r.premium ? "yes" : "";
            console.log(`${r.domain.padEnd(35)} ${price.padEnd(12)} ${premium}`);
          }
        }
      }
      break;
    }

    case "quote": {
      const domain = argv[2];
      if (!domain) {
        process.stderr.write("Usage: prim domain quote DOMAIN\n");
        process.exit(1);
      }
      const years = getFlag("years", argv);
      const body: Record<string, unknown> = { domain };
      if (years) body.years = Number(years);
      const res = await primFetch(`${baseUrl}/v1/domains/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as {
        quote_id: string;
        domain: string;
        total_cost_usd: number;
        expires_at: string;
      };
      if (quiet) {
        console.log(data.quote_id);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "register": {
      // 2-step: quote then register
      const domain = argv[2];
      if (!domain) {
        process.stderr.write("Usage: prim domain register DOMAIN [--years N]\n");
        process.exit(1);
      }
      const years = getFlag("years", argv);

      // Step 1: get quote
      const quoteBody: Record<string, unknown> = { domain };
      if (years) quoteBody.years = Number(years);
      const quoteRes = await primFetch(`${baseUrl}/v1/domains/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteBody),
      });
      if (!quoteRes.ok) return handleError(quoteRes);
      const quote = (await quoteRes.json()) as {
        quote_id: string;
        domain: string;
        total_cost_usd: number;
        years: number;
        expires_at: string;
      };

      if (!quiet) {
        console.log(
          `Registering ${quote.domain} for ${quote.years} year(s) — $${quote.total_cost_usd.toFixed(2)} USD`,
        );
      }

      // Step 2: register with quote_id
      const regRes = await primFetch(`${baseUrl}/v1/domains/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: quote.quote_id }),
      });
      if (!regRes.ok) return handleError(regRes);
      const data = (await regRes.json()) as {
        domain: string;
        zone_id: string | null;
        nameservers: string[] | null;
        recovery_token: string | null;
      };
      if (quiet) {
        console.log(data.domain);
      } else {
        console.log(JSON.stringify(data, null, 2));
        if (data.recovery_token) {
          console.log(`\nIMPORTANT: Save your recovery token: ${data.recovery_token}`);
        }
      }
      break;
    }

    case "recover": {
      const domain = argv[2];
      const secret = getFlag("secret", argv);
      if (!domain || !secret) {
        process.stderr.write("Usage: prim domain recover DOMAIN --secret SECRET\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/domains/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recovery_token: secret }),
      });
      if (!res.ok) return handleError(res);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case "status": {
      const domain = argv[2];
      if (!domain) {
        process.stderr.write("Usage: prim domain status DOMAIN\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/domains/${domain}/status`);
      if (!res.ok) return handleError(res);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case "ns": {
      const domain = argv[2];
      if (!domain) {
        process.stderr.write("Usage: prim domain ns DOMAIN\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/domains/${domain}/configure-ns`, {
        method: "POST",
      });
      if (!res.ok) return handleError(res);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    default:
      console.log("Usage: prim domain <search|quote|register|recover|status|ns|zone|record>");
      process.exit(1);
  }
}
