import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/crypto", () => ({
  decryptPassword: vi.fn((enc: string) => enc.replace("encrypted:", "")),
}));

vi.mock("../src/db", () => ({
  insertWebhookLog: vi.fn(),
  incrementWebhookFailures: vi.fn(() => 1),
  resetWebhookFailures: vi.fn(),
  updateWebhookStatus: vi.fn(),
}));

import type { WebhookPayload } from "../src/api";
import {
  incrementWebhookFailures,
  insertWebhookLog,
  resetWebhookFailures,
  updateWebhookStatus,
} from "../src/db";
import type { WebhookRow } from "../src/db";
import {
  deliverWebhook,
  dispatchWebhookDeliveries,
  signPayload,
  verifySignature,
} from "../src/webhook-delivery";

function makeWebhook(overrides: Partial<WebhookRow> = {}): WebhookRow {
  return {
    id: "wh_test1234",
    mailbox_id: "mbx_test",
    owner_wallet: "0xaaa",
    url: "http://localhost:9999/hook",
    secret_enc: null,
    events: '["message.received"]',
    status: "active",
    consecutive_failures: 0,
    created_at: Date.now(),
    ...overrides,
  };
}

function makePayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    event: "message.received",
    mailbox_id: "mbx_test",
    message_id: "email_abc",
    from: { name: "Alice", email: "[email protected]" },
    to: [{ name: null, email: "[email protected]" }],
    subject: "Hello",
    preview: "Hey...",
    received_at: "2026-02-25T10:00:00Z",
    size: 1234,
    has_attachment: false,
    timestamp: "2026-02-25T10:00:05Z",
    ...overrides,
  };
}

describe("webhook-delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("signPayload / verifySignature", () => {
    it("produces consistent HMAC-SHA256 hex digest", () => {
      const sig = signPayload("my-secret", '{"event":"test"}');
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
      // Same input produces same output
      expect(signPayload("my-secret", '{"event":"test"}')).toBe(sig);
    });

    it("verifySignature returns true for valid signature", () => {
      const body = '{"event":"test"}';
      const sig = signPayload("my-secret", body);
      expect(verifySignature("my-secret", body, sig)).toBe(true);
    });

    it("verifySignature returns false for invalid signature", () => {
      expect(verifySignature("my-secret", '{"event":"test"}', "deadbeef".repeat(8))).toBe(false);
    });

    it("verifySignature returns false for malformed signature", () => {
      expect(verifySignature("my-secret", '{"event":"test"}', "not-hex")).toBe(false);
    });

    it("no X-Signature header when webhook has no secret", async () => {
      const wh = makeWebhook({ secret_enc: null });
      const payload = makePayload();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });

      await deliverWebhook(wh, payload);

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = fetchCall[1].headers as Record<string, string>;
      expect(headers["X-Signature"]).toBeUndefined();
    });

    it("includes X-Signature when secret is configured", async () => {
      const wh = makeWebhook({ secret_enc: "encrypted:my-secret" });
      const payload = makePayload();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });

      await deliverWebhook(wh, payload);

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = fetchCall[1].headers as Record<string, string>;
      expect(headers["X-Signature"]).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("deliverWebhook", () => {
    it("POSTs JSON payload to webhook URL with correct headers", async () => {
      const wh = makeWebhook();
      const payload = makePayload();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });

      await deliverWebhook(wh, payload);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("http://localhost:9999/hook");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe("application/json");
      expect(opts.headers["X-Webhook-Id"]).toBe("wh_test1234");
      expect(opts.headers["User-Agent"]).toBe("email.prim.sh/1.0");
      expect(JSON.parse(opts.body)).toMatchObject({ event: "message.received" });
    });

    it("logs successful delivery", async () => {
      const wh = makeWebhook();
      const payload = makePayload();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });

      await deliverWebhook(wh, payload);

      expect(insertWebhookLog).toHaveBeenCalledWith(
        expect.objectContaining({
          webhook_id: "wh_test1234",
          message_id: "email_abc",
          status_code: 200,
          attempt: 1,
          error: null,
        }),
      );
      expect(resetWebhookFailures).toHaveBeenCalledWith("wh_test1234");
    });

    it("retries on HTTP 5xx", async () => {
      const wh = makeWebhook();
      const payload = makePayload();

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: false, status: 502 })
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      // Run the delivery — it uses setTimeout for delays
      const promise = deliverWebhook(wh, payload);

      // Advance timers for retry delays
      await vi.advanceTimersByTimeAsync(10_000); // 10s delay for attempt 2
      await vi.advanceTimersByTimeAsync(60_000); // 60s delay for attempt 3

      await promise;

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(resetWebhookFailures).toHaveBeenCalledWith("wh_test1234");
    });

    it("does NOT retry on HTTP 4xx", async () => {
      const wh = makeWebhook();
      const payload = makePayload();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 400 });

      await deliverWebhook(wh, payload);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(incrementWebhookFailures).toHaveBeenCalledWith("wh_test1234");
    });

    it("logs failed delivery after max retries", async () => {
      const wh = makeWebhook();
      const payload = makePayload();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

      const promise = deliverWebhook(wh, payload);
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.advanceTimersByTimeAsync(60_000);
      await promise;

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(incrementWebhookFailures).toHaveBeenCalledWith("wh_test1234");
    });

    it("auto-pauses webhook after consecutive failures threshold", async () => {
      const wh = makeWebhook();
      const payload = makePayload();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });
      (incrementWebhookFailures as ReturnType<typeof vi.fn>).mockReturnValue(10);

      const promise = deliverWebhook(wh, payload);
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.advanceTimersByTimeAsync(60_000);
      await promise;

      expect(updateWebhookStatus).toHaveBeenCalledWith("wh_test1234", "paused");
    });

    it("handles network errors gracefully", async () => {
      const wh = makeWebhook();
      const payload = makePayload();

      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

      const promise = deliverWebhook(wh, payload);
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.advanceTimersByTimeAsync(60_000);
      await promise;

      expect(insertWebhookLog).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Network error",
          status_code: null,
        }),
      );
      expect(incrementWebhookFailures).toHaveBeenCalled();
    });
  });

  describe("dispatchWebhookDeliveries", () => {
    it("fires delivery for each webhook", () => {
      const wh1 = makeWebhook({ id: "wh_1" });
      const wh2 = makeWebhook({ id: "wh_2" });
      const payload = makePayload();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });

      dispatchWebhookDeliveries([wh1, wh2], payload);

      // Fire-and-forget, so fetch is called twice (eventually)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
