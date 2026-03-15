// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/create/generated/openapi.yaml
// Regenerate: pnpm gen:cli

import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "@primsh/keystore";
import { createCreateClient } from "@primsh/sdk";
import { getFlag, hasFlag, resolvePassphrase } from "../src/flags.ts";

export function resolveCreateUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_CREATE_URL) return process.env.PRIM_CREATE_URL;
  return "https://create.prim.sh";
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
  const client = createCreateClient(primFetch, baseUrl);

  if (!sub || sub === "--help" || sub === "-h") {
    console.log("Usage: prim create <scaffold|validate|schema|ls> [args] [flags]");
    console.log("");
    console.log("  Usage: prim create scaffold --spec SPEC");
    console.log("  Usage: prim create validate --spec SPEC");
    console.log("  Usage: prim create schema");
    console.log("  Usage: prim create ls");
    process.exit(1);
  }

  switch (sub) {
    case "scaffold": {
      const spec = getFlag("spec", argv);
      if (!spec) {
        process.stderr.write(
          "Usage: prim create scaffold --spec SPEC\n",
        );
        process.exit(1);
      }
      const reqBody: Record<string, unknown> = {};
      reqBody.spec = spec;
      const data = await client.scaffold(reqBody as never);
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "validate": {
      const spec = getFlag("spec", argv);
      if (!spec) {
        process.stderr.write(
          "Usage: prim create validate --spec SPEC\n",
        );
        process.exit(1);
      }
      const reqBody: Record<string, unknown> = {};
      reqBody.spec = spec;
      const data = await client.validate(reqBody as never);
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "schema": {
      const data = await client.getSchema();
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "ls": {
      const data = await client.listPorts();
      if (quiet) {
        console.log(JSON.stringify(data));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    default:
      console.log("Usage: prim create <scaffold|validate|schema|ls>");
      process.exit(1);
  }
}

// END:PRIM:CLI
