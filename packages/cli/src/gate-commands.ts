// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/gate/openapi.yaml
// Regenerate: pnpm gen:cli

import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "@primsh/keystore";
import { createGateClient } from "@primsh/sdk";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";

export function resolveGateUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_GATE_URL) return process.env.PRIM_GATE_URL;
  return "https://gate.prim.sh";
}

export async function runGateCommand(sub: string, argv: string[]): Promise<void> {
  const baseUrl = resolveGateUrl(argv);
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
  const client = createGateClient(primFetch, baseUrl);

  if (!sub || sub === "--help" || sub === "-h") {
    console.log("Usage: prim gate <invite> [args] [flags]");
    console.log("");
    console.log("  Usage: prim gate invite --code CODE --wallet WALLET");
    process.exit(1);
  }

  switch (sub) {
    case "invite": {
      const code = getFlag("code", argv);
      const wallet = getFlag("wallet", argv);
      if (!code || !wallet) {
        process.stderr.write(
          "Usage: prim gate invite --code CODE --wallet WALLET\n",
        );
        process.exit(1);
      }
      const reqBody: Record<string, unknown> = {};
      reqBody.code = code;
      reqBody.wallet = wallet;
      const data = await client.redeemInvite(reqBody as never);
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    default:
      console.log("Usage: prim gate <invite>");
      process.exit(1);
  }
}

// END:PRIM:CLI
