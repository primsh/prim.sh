/**
 * Webhook delivery engine (R-7).
 * Async delivery to agent webhook URLs with HMAC signing and retry.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptPassword } from "./crypto.ts";
import {
  insertWebhookLog,
  incrementWebhookFailures,
  resetWebhookFailures,
  updateWebhookStatus,
} from "./db.ts";
import type { WebhookRow } from "./db.ts";
import type { WebhookPayload } from "./api.ts";

const DELIVERY_TIMEOUT_MS = Number(process.env.WEBHOOK_DELIVERY_TIMEOUT_MS) || 10_000;
const MAX_RETRIES = Number(process.env.WEBHOOK_MAX_RETRIES) || 3;
const CONSECUTIVE_FAILURES_PAUSE = Number(process.env.WEBHOOK_CONSECUTIVE_FAILURES_PAUSE) || 10;
const RETRY_DELAYS = [0, 10_000, 60_000];

export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(secret: string, body: string, signature: string): boolean {
  const expected = signPayload(secret, body);
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

async function attemptDelivery(
  webhook: WebhookRow,
  payload: WebhookPayload,
  attempt: number,
): Promise<{ ok: boolean; statusCode: number | null; error: string | null }> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Id": webhook.id,
    "User-Agent": "relay.prim.sh/1.0",
  };

  if (webhook.secret_enc) {
    try {
      const secret = decryptPassword(webhook.secret_enc);
      headers["X-Signature"] = signPayload(secret, body);
    } catch {
      // Can't decrypt secret — deliver without signature
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    insertWebhookLog({
      webhook_id: webhook.id,
      message_id: payload.message_id,
      status_code: res.status,
      attempt,
      delivered_at: Date.now(),
      error: res.ok ? null : `HTTP ${res.status}`,
    });

    return { ok: res.ok, statusCode: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    insertWebhookLog({
      webhook_id: webhook.id,
      message_id: payload.message_id,
      status_code: null,
      attempt,
      delivered_at: null,
      error: message,
    });
    return { ok: false, statusCode: null, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Deliver a webhook payload with retry logic.
 * Retries on 5xx/network errors. Does NOT retry on 4xx (permanent failure).
 */
export async function deliverWebhook(
  webhook: WebhookRow,
  payload: WebhookPayload,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const delay = RETRY_DELAYS[attempt - 1] ?? 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const result = await attemptDelivery(webhook, payload, attempt);

    if (result.ok) {
      resetWebhookFailures(webhook.id);
      return;
    }

    // Don't retry on 4xx — it's a client error
    if (result.statusCode !== null && result.statusCode >= 400 && result.statusCode < 500) {
      break;
    }
  }

  // All attempts failed
  const failures = incrementWebhookFailures(webhook.id);
  if (failures >= CONSECUTIVE_FAILURES_PAUSE) {
    updateWebhookStatus(webhook.id, "paused");
  }
}

/**
 * Dispatch webhook delivery for all active webhooks on a mailbox.
 * Runs asynchronously — does not block the caller.
 */
export function dispatchWebhookDeliveries(
  webhooks: WebhookRow[],
  payload: WebhookPayload,
): void {
  for (const wh of webhooks) {
    // Fire and forget — delivery runs in background
    deliverWebhook(wh, payload);
  }
}
