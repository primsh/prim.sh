// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/track/openapi.yaml
// Regenerate: pnpm gen:cli
// BEGIN:PRIM:CLI

import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "./config.ts";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";

export function resolveTrackUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_TRACK_URL) return process.env.PRIM_TRACK_URL;
  return "https://track.prim.sh";
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

export async function runTrackCommand(sub: string, argv: string[]): Promise<void> {
  const baseUrl = resolveTrackUrl(argv);
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
    console.log("Usage: prim track <package> [args] [flags]");
    console.log("");
    console.log("  Usage: prim track package --tracking-number TRACKING_NUMBER [--carrier VALUE]");
    process.exit(1);
  }

  switch (sub) {
    case "package": {
      const trackingNumber = getFlag("tracking-number", argv);
      const carrier = getFlag("carrier", argv);
      if (!trackingNumber) {
        process.stderr.write(
          "Usage: prim track package --tracking-number TRACKING_NUMBER [--carrier VALUE]\n",
        );
        process.exit(1);
      }
      const reqBody: Record<string, unknown> = {};
      reqBody.tracking_number = trackingNumber;
      if (carrier) reqBody.carrier = carrier;
      const res = await primFetch(`${baseUrl}/v1/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
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
      console.log("Usage: prim track <package>");
      process.exit(1);
  }
}

// END:PRIM:CLI
