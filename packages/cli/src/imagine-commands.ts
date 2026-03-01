// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/imagine/openapi.yaml
// Regenerate: pnpm gen:cli

import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "@primsh/keystore";
import { createImagineClient } from "@primsh/sdk";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";

export function resolveImagineUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_IMAGINE_URL) return process.env.PRIM_IMAGINE_URL;
  return "https://imagine.prim.sh";
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
  const client = createImagineClient(primFetch, baseUrl);

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
      const reqBody: Record<string, unknown> = {};
      const data = await client.generate(reqBody as never);
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "describe": {
      const reqBody: Record<string, unknown> = {};
      const data = await client.describe(reqBody as never);
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "upscale": {
      const reqBody: Record<string, unknown> = {};
      const data = await client.upscale(reqBody as never);
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "ls": {
      const data = await client.listModels();
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
