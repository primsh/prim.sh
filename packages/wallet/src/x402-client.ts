import { x402Client, x402HTTPClient } from "@x402/core/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { decryptPrivateKey } from "./keystore.ts";
import { getWalletByAddress } from "./db.ts";
import { getNetworkConfig } from "@agentstack/x402-middleware";

export interface X402FetchOptions extends RequestInit {
  walletAddress: string;
  maxPayment?: string;
}

function getViemChain(chainId: number) {
  if (chainId === 84532) return baseSepolia;
  return base;
}

/**
 * Creates an x402HTTPClient with the given private key signer.
 * A new client is created per-request so the decrypted key is scoped to signing.
 */
function buildHttpClient(privateKeyHex: `0x${string}`): x402HTTPClient {
  const account = privateKeyToAccount(privateKeyHex);
  const netConfig = getNetworkConfig();
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
 * Parses a USDC amount string into a comparable bigint (6 decimal places).
 * e.g. "1.00" → 1_000_000n
 */
function parseUsdc(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(6, "0").slice(0, 6);
  return BigInt(whole ?? "0") * 1_000_000n + BigInt(fracPadded);
}

/**
 * x402Fetch — drop-in fetch wrapper that auto-handles 402 payment-required responses.
 *
 * Flow:
 * 1. Make initial request
 * 2. If not 402, return immediately
 * 3. Parse Payment-Required header
 * 4. Load + decrypt wallet key from DB
 * 5. Check price against maxPayment cap
 * 6. Sign EIP-3009 payment via x402 client
 * 7. Retry with Payment-Signature header
 * 8. Return retry response (no second retry)
 */
export async function x402Fetch(url: string, options: X402FetchOptions): Promise<Response> {
  const { walletAddress, maxPayment = "1.00", ...fetchOptions } = options;

  // Step 1: Initial request
  const firstResponse = await fetch(url, fetchOptions);

  if (firstResponse.status !== 402) {
    return firstResponse;
  }

  // Step 2: Parse Payment-Required header
  const paymentRequiredHeader = firstResponse.headers.get("X-Payment-Required") ??
    firstResponse.headers.get("Payment-Required");

  if (!paymentRequiredHeader) {
    // No payment header — return the 402 as-is
    return firstResponse;
  }

  const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);

  // Step 3: Load wallet from DB
  const row = getWalletByAddress(walletAddress);
  if (!row) {
    throw new Error(`Wallet not found: ${walletAddress}`);
  }
  if (row.deactivated_at !== null) {
    throw new Error(`Wallet is deactivated: ${walletAddress}`);
  }

  // Step 4: Check price against maxPayment cap
  // paymentRequired.accepts contains the payment requirements; pick the first one
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

  // Step 5: Decrypt private key (in-memory only, scoped to this block)
  const privateKey = decryptPrivateKey(row.encrypted_key) as `0x${string}`;

  // Step 6: Build x402 client with the signer and create payment payload
  const httpClient = buildHttpClient(privateKey);
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);

  // Step 7: Encode payment header and retry
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

  const existingHeaders = fetchOptions.headers
    ? new Headers(fetchOptions.headers as HeadersInit)
    : new Headers();

  for (const [key, value] of Object.entries(paymentHeaders)) {
    existingHeaders.set(key, value);
  }

  const retryResponse = await fetch(url, {
    ...fetchOptions,
    headers: existingHeaders,
  });

  // Step 8: Return retry response regardless of status (no infinite loop)
  return retryResponse;
}
