import { readFileSync } from "node:fs";
import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "@primsh/keystore";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

export function resolveEmailUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_EMAIL_URL) return process.env.PRIM_EMAIL_URL;
  return "https://email.prim.sh";
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

export async function runEmailCommand(sub: string, argv: string[]): Promise<void> {
  const baseUrl = resolveEmailUrl(argv);
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

  // Handle webhook subcommands
  if (sub === "webhook") {
    const webhookSub = argv[2];
    const mailboxId = argv[3];
    switch (webhookSub) {
      case "add": {
        if (!mailboxId) {
          process.stderr.write(
            "Usage: prim email webhook add MAILBOX_ID --target URL [--secret SECRET]\n",
          );
          process.exit(1);
        }
        const targetUrl = getFlag("target", argv);
        if (!targetUrl) {
          process.stderr.write(
            "Usage: prim email webhook add MAILBOX_ID --target URL [--secret SECRET]\n",
          );
          process.exit(1);
        }
        const secret = getFlag("secret", argv);
        const reqBody: Record<string, string> = { url: targetUrl };
        if (secret) reqBody.secret = secret;
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${mailboxId}/webhooks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
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
        if (!mailboxId) {
          process.stderr.write("Usage: prim email webhook ls MAILBOX_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${mailboxId}/webhooks`);
        if (!res.ok) return handleError(res);
        const data = (await res.json()) as { webhooks: Array<{ id: string }> };
        if (quiet) {
          for (const w of data.webhooks) console.log(w.id);
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      case "rm": {
        const webhookId = argv[4];
        if (!mailboxId || !webhookId) {
          process.stderr.write("Usage: prim email webhook rm MAILBOX_ID WEBHOOK_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/mailboxes/${mailboxId}/webhooks/${webhookId}`, {
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
        console.log("Usage: prim email webhook <add|ls|rm>");
        process.exit(1);
    }
    return;
  }

  // Handle domain subcommands
  if (sub === "domain") {
    const domainSub = argv[2];
    switch (domainSub) {
      case "add": {
        const domain = getFlag("domain", argv);
        if (!domain) {
          process.stderr.write("Usage: prim email domain add --domain NAME\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/domains`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
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
        const res = await primFetch(`${baseUrl}/v1/domains`);
        if (!res.ok) return handleError(res);
        const data = (await res.json()) as { domains: Array<{ id: string }> };
        if (quiet) {
          for (const d of data.domains) console.log(d.id);
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      case "get": {
        const domainId = argv[3];
        if (!domainId) {
          process.stderr.write("Usage: prim email domain get DOMAIN_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/domains/${domainId}`);
        if (!res.ok) return handleError(res);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      case "verify": {
        const domainId = argv[3];
        if (!domainId) {
          process.stderr.write("Usage: prim email domain verify DOMAIN_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/domains/${domainId}/verify`, {
          method: "POST",
        });
        if (!res.ok) return handleError(res);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      case "rm": {
        const domainId = argv[3];
        if (!domainId) {
          process.stderr.write("Usage: prim email domain rm DOMAIN_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/domains/${domainId}`, {
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
        console.log("Usage: prim email domain <add|ls|get|verify|rm>");
        process.exit(1);
    }
    return;
  }

  switch (sub) {
    case "create": {
      const username = getFlag("username", argv);
      const ttl = getFlag("ttl", argv);
      const reqBody: Record<string, string> = {};
      if (username) reqBody.username = username;
      if (ttl) reqBody.ttl = ttl;
      const res = await primFetch(`${baseUrl}/v1/mailboxes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { mailbox: { id: string } };
      if (quiet) {
        console.log(data.mailbox.id);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "ls": {
      const page = getFlag("page", argv) ?? "1";
      const perPage = getFlag("per-page", argv) ?? "20";
      const includeExpired = hasFlag("include-expired", argv);
      const url = new URL(`${baseUrl}/v1/mailboxes`);
      url.searchParams.set("page", page);
      url.searchParams.set("per_page", perPage);
      if (includeExpired) url.searchParams.set("include_expired", "true");
      const res = await primFetch(url.toString());
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { mailboxes: Array<{ id: string }> };
      if (quiet) {
        for (const m of data.mailboxes) console.log(m.id);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "get": {
      const mailboxId = argv[2];
      if (!mailboxId) {
        process.stderr.write("Usage: prim email get MAILBOX_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/mailboxes/${mailboxId}`);
      if (!res.ok) return handleError(res);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case "rm": {
      const mailboxId = argv[2];
      if (!mailboxId) {
        process.stderr.write("Usage: prim email rm MAILBOX_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/mailboxes/${mailboxId}`, {
        method: "DELETE",
      });
      if (!res.ok) return handleError(res);
      if (!quiet) {
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "renew": {
      const mailboxId = argv[2];
      if (!mailboxId) {
        process.stderr.write("Usage: prim email renew MAILBOX_ID [--ttl MS]\n");
        process.exit(1);
      }
      const ttl = getFlag("ttl", argv);
      const reqBody: Record<string, string> = {};
      if (ttl) reqBody.ttl = ttl;
      const res = await primFetch(`${baseUrl}/v1/mailboxes/${mailboxId}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) return handleError(res);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case "inbox": {
      const mailboxId = argv[2];
      if (!mailboxId) {
        process.stderr.write(
          "Usage: prim email inbox MAILBOX_ID [--limit N] [--folder NAME] [--json]\n",
        );
        process.exit(1);
      }
      const limit = getFlag("limit", argv);
      const folder = getFlag("folder", argv);
      const jsonOutput = hasFlag("json", argv);
      const url = new URL(`${baseUrl}/v1/mailboxes/${mailboxId}/messages`);
      if (limit) url.searchParams.set("limit", limit);
      if (folder) url.searchParams.set("folder", folder);
      const res = await primFetch(url.toString());
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as {
        messages: Array<{
          id: string;
          from: string;
          subject: string;
          date: string;
          preview?: string;
        }>;
      };
      if (quiet) {
        for (const m of data.messages) console.log(m.id);
      } else if (jsonOutput) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        if (data.messages.length === 0) {
          console.log("No messages.");
        } else {
          console.log(`${"FROM".padEnd(30)} ${"SUBJECT".padEnd(40)} ${"DATE".padEnd(20)}`);
          for (const m of data.messages) {
            const from = (m.from ?? "").slice(0, 28).padEnd(30);
            const subject = (m.subject ?? "").slice(0, 38).padEnd(40);
            const date = (m.date ?? "").slice(0, 18).padEnd(20);
            console.log(`${from} ${subject} ${date}`);
          }
        }
      }
      break;
    }

    case "read": {
      const mailboxId = argv[2];
      const messageId = argv[3];
      if (!mailboxId || !messageId) {
        process.stderr.write("Usage: prim email read MAILBOX_ID MESSAGE_ID [--html] [--json]\n");
        process.exit(1);
      }
      const wantHtml = hasFlag("html", argv);
      const jsonOutput = hasFlag("json", argv);
      const res = await primFetch(`${baseUrl}/v1/mailboxes/${mailboxId}/messages/${messageId}`);
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as {
        from: string;
        to: string;
        subject: string;
        date: string;
        text?: string;
        html?: string;
      };
      if (jsonOutput) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`From:    ${data.from}`);
        console.log(`To:      ${data.to}`);
        console.log(`Subject: ${data.subject}`);
        console.log(`Date:    ${data.date}`);
        console.log("");
        if (wantHtml) {
          console.log(data.html ?? "(no HTML body)");
        } else {
          console.log(data.text ?? "(no text body)");
        }
      }
      break;
    }

    case "send": {
      const mailboxId = argv[2];
      if (!mailboxId) {
        process.stderr.write(
          "Usage: prim email send MAILBOX_ID --to ADDR --subject SUBJ [--body TEXT] [--file PATH] [--html HTML] [--cc ADDR] [--bcc ADDR]\n",
        );
        process.exit(1);
      }
      const to = getFlag("to", argv);
      const subject = getFlag("subject", argv);
      if (!to || !subject) {
        process.stderr.write(
          "Usage: prim email send MAILBOX_ID --to ADDR --subject SUBJ [--body TEXT] [--file PATH] [--html HTML] [--cc ADDR] [--bcc ADDR]\n",
        );
        process.exit(1);
      }
      const bodyFlag = getFlag("body", argv);
      const fileFlag = getFlag("file", argv);
      const htmlFlag = getFlag("html", argv);
      const cc = getFlag("cc", argv);
      const bcc = getFlag("bcc", argv);

      let textBody: string | undefined;
      if (bodyFlag) {
        textBody = bodyFlag;
      } else if (fileFlag) {
        textBody = readFileSync(fileFlag, "utf-8");
      } else if (!process.stdin.isTTY) {
        const buf = await readStdin();
        textBody = buf.toString("utf-8");
      }

      const reqBody: Record<string, string> = { to, subject };
      if (textBody) reqBody.body = textBody;
      if (htmlFlag) reqBody.html = htmlFlag;
      if (cc) reqBody.cc = cc;
      if (bcc) reqBody.bcc = bcc;

      const res = await primFetch(`${baseUrl}/v1/mailboxes/${mailboxId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { message_id?: string };
      if (quiet) {
        console.log(data.message_id ?? "");
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    default:
      console.log("Usage: prim email <create|ls|get|rm|renew|inbox|read|send|webhook|domain>");
      process.exit(1);
  }
}
