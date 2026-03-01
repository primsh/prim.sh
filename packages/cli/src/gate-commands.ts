// SPDX-License-Identifier: Apache-2.0
// Manually maintained — gen-cli skips files without the generated marker.

import { createPrimFetch } from "@primsh/x402-client";
import { getConfig, writeConfig } from "@primsh/keystore";
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

      // gate.sh is testnet-only — save network so balance/store/search default correctly
      if (!config.network) {
        config.network = "eip155:84532";
        await writeConfig(config);
      }

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
