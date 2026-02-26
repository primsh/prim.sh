import { getDefaultAddress } from "./config.ts";
import { getFlag, hasFlag } from "./flags.ts";

export function resolveFaucetUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_FAUCET_URL) return process.env.PRIM_FAUCET_URL;
  return "https://faucet.prim.sh";
}

async function resolveAddress(argv: string[]): Promise<string> {
  const positional = argv[2];
  if (positional && !positional.startsWith("--")) return positional;
  const defaultAddr = await getDefaultAddress();
  if (defaultAddr) return defaultAddr;
  process.stderr.write("Error: No address provided and no default wallet configured\n");
  process.exit(1);
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

export async function runFaucetCommand(sub: string, argv: string[]): Promise<void> {
  const baseUrl = resolveFaucetUrl(argv);
  const quiet = hasFlag("quiet", argv);

  switch (sub) {
    case "usdc": {
      const address = await resolveAddress(argv);
      const res = await fetch(`${baseUrl}/v1/faucet/usdc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { txHash: string; amount: string; currency: string; chain: string };
      if (quiet) {
        console.log(data.txHash);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "eth": {
      const address = await resolveAddress(argv);
      const res = await fetch(`${baseUrl}/v1/faucet/eth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { txHash: string; amount: string; currency: string; chain: string };
      if (quiet) {
        console.log(data.txHash);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "status": {
      const address = await resolveAddress(argv);
      const url = new URL(`${baseUrl}/v1/faucet/status`);
      url.searchParams.set("address", address);
      const res = await fetch(url.toString());
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as {
        address: string;
        usdc: { available: boolean; retryAfterMs: number };
        eth: { available: boolean; retryAfterMs: number };
      };
      if (quiet) {
        console.log(`usdc:${data.usdc.available} eth:${data.eth.available}`);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    default:
      console.log("Usage: prim faucet <usdc|eth|status>");
      process.exit(1);
  }
}
