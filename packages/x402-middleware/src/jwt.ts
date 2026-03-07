// SPDX-License-Identifier: Apache-2.0
import { type Hex, hashMessage, recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ServiceResult } from "./types.js";

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export interface JwtPayload {
  sub: string; // wallet address (checksummed)
  iat: number; // issued at (unix seconds)
  exp: number; // expires at (unix seconds)
}

export interface SignedJwt {
  payload: JwtPayload;
  signature: Hex;
}

function encodePayload(payload: JwtPayload): string {
  return JSON.stringify({ sub: payload.sub, iat: payload.iat, exp: payload.exp });
}

/**
 * Sign a session JWT with a wallet private key.
 * The signature is an EIP-191 personal_sign over the canonical JSON payload.
 */
export async function signSessionJwt(
  privateKey: Hex,
  options?: { ttlSeconds?: number },
): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  const now = Math.floor(Date.now() / 1000);
  const ttl = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  const payload: JwtPayload = {
    sub: account.address,
    iat: now,
    exp: now + ttl,
  };

  const message = encodePayload(payload);
  const signature = await account.signMessage({ message });

  const token: SignedJwt = { payload, signature };
  return btoa(JSON.stringify(token));
}

/**
 * Verify a session JWT. Returns the wallet address on success.
 * Stateless: no database or session storage needed.
 */
export async function verifySessionJwt(token: string): Promise<ServiceResult<{ address: string }>> {
  let parsed: SignedJwt;
  try {
    const decoded = atob(token);
    parsed = JSON.parse(decoded) as SignedJwt;
  } catch {
    return { ok: false, status: 401, code: "invalid_jwt", message: "Malformed JWT token" };
  }

  const { payload, signature } = parsed;

  if (!payload?.sub || !payload?.iat || !payload?.exp || !signature) {
    return { ok: false, status: 401, code: "invalid_jwt", message: "Missing JWT fields" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now >= payload.exp) {
    return { ok: false, status: 401, code: "jwt_expired", message: "JWT has expired" };
  }

  const message = encodePayload(payload);

  try {
    const recovered = await recoverAddress({
      hash: hashMessage(message),
      signature: signature as Hex,
    });

    if (recovered.toLowerCase() !== payload.sub.toLowerCase()) {
      return {
        ok: false,
        status: 401,
        code: "invalid_signature",
        message: "JWT signature does not match claimed address",
      };
    }

    return { ok: true, data: { address: recovered } };
  } catch {
    return {
      ok: false,
      status: 401,
      code: "invalid_signature",
      message: "Failed to recover signer from JWT signature",
    };
  }
}
