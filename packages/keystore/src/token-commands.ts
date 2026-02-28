import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "./config.ts";
import { getFlag, hasFlag, resolvePassphrase } from "./flags.ts";

export function resolveTokenUrl(argv: string[]): string {
  const flag = getFlag("url", argv);
  if (flag) return flag;
  if (process.env.PRIM_TOKEN_URL) return process.env.PRIM_TOKEN_URL;
  return "https://token.prim.sh";
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

export async function runTokenCommand(sub: string, argv: string[]): Promise<void> {
  const baseUrl = resolveTokenUrl(argv);
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
    maxPayment: maxPaymentFlag ?? process.env.PRIM_MAX_PAYMENT ?? "2.00",
    network: config.network,
  });

  // Handle pool subcommands
  if (sub === "pool") {
    const poolSub = argv[2];
    const tokenId = argv[3];
    switch (poolSub) {
      case "create": {
        if (!tokenId) {
          process.stderr.write(
            "Usage: prim token pool create TOKEN_ID --price N [--fee-tier 3000]\n",
          );
          process.exit(1);
        }
        const pricePerToken = getFlag("price", argv);
        if (!pricePerToken) {
          process.stderr.write(
            "Usage: prim token pool create TOKEN_ID --price N [--fee-tier 3000]\n",
          );
          process.exit(1);
        }
        const feeTierStr = getFlag("fee-tier", argv);
        const reqBody: Record<string, unknown> = { pricePerToken };
        if (feeTierStr) reqBody.feeTier = Number(feeTierStr);
        const res = await primFetch(`${baseUrl}/v1/tokens/${tokenId}/pool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        });
        if (!res.ok) return handleError(res);
        const data = await res.json();
        if (quiet) {
          const d = data as { pool_address?: string };
          console.log(d.pool_address ?? "");
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
        break;
      }

      case "get": {
        if (!tokenId) {
          process.stderr.write("Usage: prim token pool get TOKEN_ID\n");
          process.exit(1);
        }
        const res = await primFetch(`${baseUrl}/v1/tokens/${tokenId}/pool`);
        if (!res.ok) return handleError(res);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      case "params": {
        if (!tokenId) {
          process.stderr.write(
            "Usage: prim token pool params TOKEN_ID --token-amount N --usdc-amount N\n",
          );
          process.exit(1);
        }
        const tokenAmount = getFlag("token-amount", argv);
        const usdcAmount = getFlag("usdc-amount", argv);
        if (!tokenAmount || !usdcAmount) {
          process.stderr.write(
            "Usage: prim token pool params TOKEN_ID --token-amount N --usdc-amount N\n",
          );
          process.exit(1);
        }
        const url = new URL(`${baseUrl}/v1/tokens/${tokenId}/pool/liquidity-params`);
        url.searchParams.set("tokenAmount", tokenAmount);
        url.searchParams.set("usdcAmount", usdcAmount);
        const res = await primFetch(url.toString());
        if (!res.ok) return handleError(res);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      default:
        console.log("Usage: prim token pool <create|get|params>");
        process.exit(1);
    }
    return;
  }

  switch (sub) {
    case "deploy": {
      const name = getFlag("name", argv);
      const symbol = getFlag("symbol", argv);
      const supply = getFlag("supply", argv);
      if (!name || !symbol || !supply) {
        process.stderr.write(
          "Usage: prim token deploy --name NAME --symbol SYM --supply N [--decimals 18] [--mintable] [--max-supply N]\n",
        );
        process.exit(1);
      }
      const decimalsStr = getFlag("decimals", argv);
      const mintable = hasFlag("mintable", argv);
      const maxSupply = getFlag("max-supply", argv);
      const reqBody: Record<string, unknown> = {
        name,
        symbol,
        initialSupply: supply,
      };
      if (decimalsStr) reqBody.decimals = Number(decimalsStr);
      if (mintable) reqBody.mintable = true;
      if (maxSupply) reqBody.maxSupply = maxSupply;
      const res = await primFetch(`${baseUrl}/v1/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { id?: string };
      if (quiet) {
        console.log(data.id ?? "");
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "ls": {
      const res = await primFetch(`${baseUrl}/v1/tokens`);
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as {
        tokens: Array<{
          id: string;
          name: string;
          symbol: string;
          deploy_status: string;
          contract_address: string | null;
        }>;
      };
      if (quiet) {
        for (const t of data.tokens) console.log(t.id);
      } else {
        if (data.tokens.length === 0) {
          console.log("No tokens found.");
        } else {
          console.log(
            `${"ID".padEnd(38)} ${"SYMBOL".padEnd(8)} ${"NAME".padEnd(20)} ${"STATUS".padEnd(10)} CONTRACT`,
          );
          for (const t of data.tokens) {
            const id = t.id.padEnd(38);
            const symbol = (t.symbol ?? "").padEnd(8);
            const name = (t.name ?? "").slice(0, 18).padEnd(20);
            const status = (t.deploy_status ?? "").padEnd(10);
            const contract = t.contract_address ?? "(pending)";
            console.log(`${id} ${symbol} ${name} ${status} ${contract}`);
          }
        }
      }
      break;
    }

    case "get": {
      const tokenId = argv[2];
      if (!tokenId) {
        process.stderr.write("Usage: prim token get TOKEN_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/tokens/${tokenId}`);
      if (!res.ok) return handleError(res);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case "mint": {
      const tokenId = argv[2];
      if (!tokenId) {
        process.stderr.write("Usage: prim token mint TOKEN_ID --amount N --to ADDRESS\n");
        process.exit(1);
      }
      const amount = getFlag("amount", argv);
      const to = getFlag("to", argv);
      if (!amount || !to) {
        process.stderr.write("Usage: prim token mint TOKEN_ID --amount N --to ADDRESS\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/tokens/${tokenId}/mint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, amount }),
      });
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { tx_hash?: string };
      if (quiet) {
        console.log(data.tx_hash ?? "");
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case "supply": {
      const tokenId = argv[2];
      if (!tokenId) {
        process.stderr.write("Usage: prim token supply TOKEN_ID\n");
        process.exit(1);
      }
      const res = await primFetch(`${baseUrl}/v1/tokens/${tokenId}/supply`);
      if (!res.ok) return handleError(res);
      const data = (await res.json()) as { totalSupply?: string };
      if (quiet) {
        console.log(data.totalSupply ?? "");
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    default:
      console.log("Usage: prim token <deploy|ls|get|mint|supply|pool>");
      process.exit(1);
  }
}
