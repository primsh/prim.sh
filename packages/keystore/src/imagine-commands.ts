// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/imagine/openapi.yaml
// Regenerate: pnpm gen:cli
// BEGIN:PRIM:CLI

import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "./config.ts";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";

export function resolveImagineUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_IMAGINE_URL) return process.env.PRIM_IMAGINE_URL;
  return "https://imagine.prim.sh";
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

export async function runImagineCommand(sub: string, argv: string[]): Promise<void> {
  const baseUrl = resolveImagineUrl(argv);
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
    console.log("Usage: prim imagine <generate|describe|upscale|ls> [args] [flags]");
    console.log("");
    console.log("  Usage: prim imagine generate");
    console.log("  Usage: prim imagine describe");
    console.log("  Usage: prim imagine upscale");
    console.log("  Usage: prim imagine ls");
    process.exit(1);
  }

  switch (sub) {
    case "generate": {
      const res = await primFetch(`${baseUrl}/v1/generate`, { method: "POST" });
      if (!res.ok) return handleError(res);
      const data = await res.json();
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "describe": {
      const res = await primFetch(`${baseUrl}/v1/describe`, { method: "POST" });
      if (!res.ok) return handleError(res);
      const data = await res.json();
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "upscale": {
      const res = await primFetch(`${baseUrl}/v1/upscale`, { method: "POST" });
      if (!res.ok) return handleError(res);
      const data = await res.json();
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "ls": {
      const res = await primFetch(`${baseUrl}/v1/models`);
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
      console.log("Usage: prim imagine <generate|describe|upscale|ls>");
      process.exit(1);
  }
}

// END:PRIM:CLI
