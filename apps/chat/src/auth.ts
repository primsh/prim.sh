// SPDX-License-Identifier: Apache-2.0
import { createHmac, randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createAccount, getAccountByPasskey } from "./accounts.ts";

// In-memory challenge store (keyed by random challenge ID)
const challengeStore = new Map<string, { challenge: string; expires: number }>();

function getRpId(): string {
  return process.env.CHAT_RP_ID ?? "localhost";
}

function getRpOrigin(): string {
  return process.env.CHAT_RP_ORIGIN ?? "http://localhost:3020";
}

const SESSION_SECRET = (): string => {
  const secret = process.env.CHAT_SESSION_SECRET;
  if (!secret) throw new Error("CHAT_SESSION_SECRET env var is required");
  return secret;
};

function createSessionToken(accountId: string): string {
  // Simple signed token: accountId.timestamp.signature
  const timestamp = Date.now().toString(36);
  const payload = `${accountId}.${timestamp}`;
  const signature = createHmac("sha256", SESSION_SECRET())
    .update(payload)
    .digest("hex")
    .slice(0, 16);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [accountId, timestamp, signature] = parts;
  const payload = `${accountId}.${timestamp}`;
  const expected = createHmac("sha256", SESSION_SECRET())
    .update(payload)
    .digest("hex")
    .slice(0, 16);
  if (signature !== expected) return null;

  // Check expiry (7 days)
  const ts = Number.parseInt(timestamp, 36);
  if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return null;

  return accountId;
}

export function getSessionAccountId(c: { req: { raw: Request } }): string | null {
  const cookie = getCookie(c as Parameters<typeof getCookie>[0], "session");
  if (!cookie) return null;
  return verifySessionToken(cookie);
}

export function registerAuthRoutes(app: Hono): void {
  // POST /auth/register/options
  app.post("/auth/register/options", async (c) => {
    const rpId = getRpId();
    const options = await generateRegistrationOptions({
      rpName: "prim",
      rpID: rpId,
      userName: `user_${randomBytes(4).toString("hex")}`,
      attestationType: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
    });

    const challengeId = randomBytes(16).toString("hex");
    challengeStore.set(challengeId, {
      challenge: options.challenge,
      expires: Date.now() + 5 * 60 * 1000,
    });

    return c.json({ options, challenge_id: challengeId });
  });

  // POST /auth/register/verify
  app.post("/auth/register/verify", async (c) => {
    const body = await c.req.json();
    const { credential, challenge_id } = body;

    const stored = challengeStore.get(challenge_id);
    if (!stored || Date.now() > stored.expires) {
      return c.json({ error: { code: "challenge_expired", message: "Challenge expired" } }, 400);
    }
    challengeStore.delete(challenge_id);

    try {
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: stored.challenge,
        expectedOrigin: getRpOrigin(),
        expectedRPID: getRpId(),
      });

      if (!verification.verified || !verification.registrationInfo) {
        return c.json(
          { error: { code: "verification_failed", message: "Registration verification failed" } },
          400,
        );
      }

      const { credential: regCredential } = verification.registrationInfo;
      const result = createAccount(regCredential.id, regCredential.publicKey);

      if (!result.ok) {
        return c.json(
          { error: { code: result.code, message: result.message } },
          result.status as 409,
        );
      }

      const token = createSessionToken(result.data.id);
      setCookie(c, "session", token, {
        httpOnly: true,
        secure: getRpId() !== "localhost",
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });

      return c.json({ account: result.data });
    } catch {
      return c.json(
        { error: { code: "verification_failed", message: "Registration verification failed" } },
        400,
      );
    }
  });

  // POST /auth/login/options
  app.post("/auth/login/options", async (c) => {
    const options = await generateAuthenticationOptions({
      rpID: getRpId(),
      userVerification: "preferred",
    });

    const challengeId = randomBytes(16).toString("hex");
    challengeStore.set(challengeId, {
      challenge: options.challenge,
      expires: Date.now() + 5 * 60 * 1000,
    });

    return c.json({ options, challenge_id: challengeId });
  });

  // POST /auth/login/verify
  app.post("/auth/login/verify", async (c) => {
    const body = await c.req.json();
    const { credential, challenge_id } = body;

    const stored = challengeStore.get(challenge_id);
    if (!stored || Date.now() > stored.expires) {
      return c.json({ error: { code: "challenge_expired", message: "Challenge expired" } }, 400);
    }
    challengeStore.delete(challenge_id);

    const accountResult = getAccountByPasskey(credential.id);
    if (!accountResult.ok) {
      return c.json(
        { error: { code: "not_found", message: "No account found for this passkey" } },
        404,
      );
    }

    const account = accountResult.data;

    try {
      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: stored.challenge,
        expectedOrigin: getRpOrigin(),
        expectedRPID: getRpId(),
        credential: {
          id: account.passkey_credential_id,
          publicKey: new Uint8Array(account.passkey_public_key),
          counter: 0,
        },
      });

      if (!verification.verified) {
        return c.json(
          { error: { code: "verification_failed", message: "Authentication failed" } },
          401,
        );
      }

      const token = createSessionToken(account.id);
      setCookie(c, "session", token, {
        httpOnly: true,
        secure: getRpId() !== "localhost",
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });

      return c.json({
        account: {
          id: account.id,
          wallet_address: account.wallet_address,
          created_at: account.created_at,
        },
      });
    } catch {
      return c.json(
        { error: { code: "verification_failed", message: "Authentication failed" } },
        401,
      );
    }
  });
}
