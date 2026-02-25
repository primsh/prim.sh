import { x402Client, x402HTTPClient } from "@x402/core/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { LocalAccount } from "viem";
import { getNetworkConfig } from "@agentstack/x402-middleware";
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

function resolveAccount(config: CreatePrimFetchConfig): LocalAccount {
  if (config.signer) return config.signer;
  if (config.privateKey) return privateKeyToAccount(config.privateKey);
  throw new Error("createPrimFetch requires either privateKey or signer");
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
 * Flow:
 * 1. Make initial request
 * 2. If not 402, return immediately
 * 3. Parse Payment-Required header
 * 4. Check price against maxPayment cap
 * 5. Sign EIP-3009 payment via x402 client
 * 6. Retry with Payment-Signature header
 * 7. Return retry response (no second retry)
 */
export function createPrimFetch(config: CreatePrimFetchConfig): typeof fetch {
  const account = resolveAccount(config);
  const maxPayment = config.maxPayment ?? "1.00";
  const httpClient = buildHttpClient(account, config.network);

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
    const requirements = paymentRequired.accepts[0];
    if (requirements) {
      const price = parseUsdc(requirements.amount);
      const cap = parseUsdc(maxPayment);
      if (price > cap) {
        throw new Error(
          `Payment of ${requirements.amount} USDC exceeds maxPayment cap of ${maxPayment} USDC`,
        );
      }
    }

    // Step 4: Sign payment
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

    return retryResponse;
  };
}
