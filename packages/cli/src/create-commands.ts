// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/create/openapi.yaml
// Regenerate: pnpm gen:cli
// BEGIN:PRIM:CLI

import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "@primsh/keystore";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";

export function resolveCreateUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_CREATE_URL) return process.env.PRIM_CREATE_URL;
  return "https://create.prim.sh";
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

export async function runCreateCommand(sub: string, argv: string[]): Promise<void> {
  const baseUrl = resolveCreateUrl(argv);
  const quiet = hasFlag("quiet", argv);
  const walletFlag = getFlag("wallet", argv);
  const passphrase = await resolvePassphrase(argv);
  const maxPaymentFlag = getFlag("max-payment", argv);
  const config = await getConfig();
  const primFetch = createPrimFetch({
    keystore:
      walletFlag !== undefined || passphrase !== undefined
        ? { address: walletFlag, passphrase }
        : true,
    maxPayment: maxPaymentFlag ?? process.env.PRIM_MAX_PAYMENT ?? "1.00",
    network: config.network,
  });

  if (!sub || sub === "--help" || sub === "-h") {
    console.log("Usage: prim create <scaffold|validate|schema|ports> [args] [flags]");
    console.log("");
    console.log("  Usage: prim create scaffold");
    console.log("  Usage: prim create validate");
    console.log("  Usage: prim create schema");
    console.log("  Usage: prim create ports");
    process.exit(1);
  }

  switch (sub) {
    case "scaffold": {
      const res = await primFetch(`${baseUrl}/v1/scaffold`, { method: "POST" });
      if (!res.ok) return handleError(res);
      const data = await res.json();
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "validate": {
      const res = await primFetch(`${baseUrl}/v1/validate`, { method: "POST" });
      if (!res.ok) return handleError(res);
      const data = await res.json();
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "schema": {
      const res = await primFetch(`${baseUrl}/v1/schema`);
      if (!res.ok) return handleError(res);
      const data = await res.json();
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "ports": {
      const res = await primFetch(`${baseUrl}/v1/ports`);
      if (!res.ok) return handleError(res);
      const data = await res.json();
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    default:
      console.log("Usage: prim create <scaffold|validate|schema|ports>");
      process.exit(1);
  }
}

// END:PRIM:CLI
