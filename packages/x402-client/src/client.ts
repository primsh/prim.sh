import { x402Client, x402HTTPClient } from "@x402/core/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { LocalAccount } from "viem";
import { getNetworkConfig } from "@primsh/x402-middleware";
import type { CreatePrimFetchConfig } from "./types.ts";

function getViemChain(chainId: number) {
  if (chainId === 84532) return baseSepolia;
  return base;
}

/**
 * Parses a USDC amount string into a comparable bigint (6 decimal places).
 * e.g. "1.00" -> 1_000_000n
 */
export function parseUsdc(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(6, "0").slice(0, 6);
  return BigInt(whole ?? "0") * 1_000_000n + BigInt(fracPadded);
}

/** Formats atomic USDC (6 decimals) back to human-readable string. */
function formatUsdc(atomic: bigint): string {
  const whole = atomic / 1_000_000n;
  const frac = atomic % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, "0")}`;
}

async function resolveKeystoreAccount(
  keystore: NonNullable<CreatePrimFetchConfig["keystore"]>,
): Promise<LocalAccount> {
  const { loadAccount } = await import("@primsh/keystore");
  const opts = keystore === true ? {} : (keystore as { address?: string; passphrase?: string });
  return loadAccount(opts.address, { passphrase: opts.passphrase });
}

function buildHttpClient(account: LocalAccount, network?: string): x402HTTPClient {
  const netConfig = getNetworkConfig(network);
  const rpcUrl = process.env.BASE_RPC_URL ?? netConfig.rpcUrl;

  const publicClient = createPublicClient({
    chain: getViemChain(netConfig.chainId),
    transport: http(rpcUrl),
  });

  const signer = {
    address: account.address,
    signTypedData: (message: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }) =>
      account.signTypedData({
        domain: message.domain as Parameters<typeof account.signTypedData>[0]["domain"],
        types: message.types as Parameters<typeof account.signTypedData>[0]["types"],
        primaryType: message.primaryType,
        message: message.message,
      }),
    readContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }) =>
      publicClient.readContract(
        args as Parameters<typeof publicClient.readContract>[0],
      ) as Promise<unknown>,
  };

  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  return new x402HTTPClient(client);
}

/**
 * Creates a fetch-compatible function that auto-handles x402 402 payment-required responses.
 *
 * Key resolution order:
 * 1. signer (viem LocalAccount)
 * 2. privateKey (hex string)
 * 3. keystore (load from ~/.prim/keys/ — lazy, async)
 * 4. AGENT_PRIVATE_KEY env var
 * 5. throw
 *
 * Flow:
 * 1. Make initial request
 * 2. If not 402, return immediately
 * 3. Parse Payment-Required header
 * 4. Check price against maxPayment cap
 * 5. Sign EIP-3009 payment via x402 client
 * 6. Retry with Payment-Signature header
 * 7. If settlement failed, wait 2s and re-sign once (configurable via retrySettlement)
 * 8. Return final response
 */
export function createPrimFetch(config: CreatePrimFetchConfig): typeof fetch {
  const maxPayment = config.maxPayment ?? "1.00";

  // Resolve sync account eagerly (signer, privateKey, AGENT_PRIVATE_KEY)
  let syncAccount: LocalAccount | null = null;
  if (config.signer) {
    syncAccount = config.signer;
  } else if (config.privateKey) {
    syncAccount = privateKeyToAccount(config.privateKey);
  } else if (!config.keystore && process.env.AGENT_PRIVATE_KEY) {
    syncAccount = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
  } else if (!config.keystore) {
    throw new Error("createPrimFetch requires either privateKey, signer, or keystore");
  }

  // Build http client eagerly for sync accounts; lazy for keystore
  const syncHttpClient = syncAccount ? buildHttpClient(syncAccount, config.network) : null;
  let keystoreClientPromise: Promise<x402HTTPClient> | null = null;

  async function getHttpClient(): Promise<x402HTTPClient> {
    if (syncHttpClient) return syncHttpClient;
    if (!keystoreClientPromise) {
      // biome-ignore lint/style/noNonNullAssertion: keystore is guaranteed set when syncHttpClient is null
      keystoreClientPromise = resolveKeystoreAccount(config.keystore!).then((account) =>
        buildHttpClient(account, config.network),
      );
    }
    return keystoreClientPromise;
  }

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Step 1: Initial request
    const firstResponse = await fetch(input, init);

    if (firstResponse.status !== 402) {
      return firstResponse;
    }

    // Step 2: Parse Payment-Required header
    const paymentRequiredHeader =
      firstResponse.headers.get("X-Payment-Required") ??
      firstResponse.headers.get("Payment-Required");

    if (!paymentRequiredHeader) {
      return firstResponse;
    }

    const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);

    // Step 3: Check price against maxPayment cap
    // x402 protocol returns amount in atomic units (micro-USDC, 6 decimals).
    // e.g. "$0.05" route price → "50000" in header. maxPayment is human-readable.
    const requirements = paymentRequired.accepts[0];
    if (requirements) {
      const priceAtomic = BigInt(requirements.amount);
      const capAtomic = parseUsdc(maxPayment);
      if (priceAtomic > capAtomic) {
        const priceHuman = formatUsdc(priceAtomic);
        throw new Error(
          `Payment of ${priceHuman} USDC exceeds maxPayment cap of ${maxPayment} USDC`,
        );
      }
    }

    // Step 4: Sign payment
    const httpClient = await getHttpClient();
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);

    // Step 5: Encode and retry
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    const existingHeaders = init?.headers
      ? new Headers(init.headers as HeadersInit)
      : new Headers();

    for (const [key, value] of Object.entries(paymentHeaders)) {
      existingHeaders.set(key, value);
    }

    const retryResponse = await fetch(input, {
      ...init,
      headers: existingHeaders,
    });

    // Step 6: Detect settlement failure and retry once
    if (retryResponse.status !== 402) {
      return retryResponse;
    }

    // Must clone before reading body — body can only be consumed once
    const retryClone = retryResponse.clone();
    let retryBody: { error?: string } = {};
    try {
      retryBody = await retryClone.json();
    } catch {
      return retryResponse;
    }

    if (retryBody.error !== "Settlement failed") {
      return retryResponse;
    }

    if (config.retrySettlement === false) {
      return retryResponse;
    }

    // Wait 2s — enough for the facilitator to complete the prior batch
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Re-sign with fresh EIP-3009 authorization
    const paymentPayload2 = await httpClient.createPaymentPayload(paymentRequired);
    const paymentHeaders2 = httpClient.encodePaymentSignatureHeader(paymentPayload2);

    const settlementRetryHeaders = init?.headers
      ? new Headers(init.headers as HeadersInit)
      : new Headers();

    for (const [key, value] of Object.entries(paymentHeaders2)) {
      settlementRetryHeaders.set(key, value);
    }

    const finalResponse = await fetch(input, {
      ...init,
      headers: settlementRetryHeaders,
    });

    return finalResponse;
  };
}
