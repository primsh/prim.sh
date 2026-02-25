import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/stalwart", () => ({
  StalwartError: class StalwartError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.name = "StalwartError";
      this.statusCode = statusCode;
      this.code = code;
    }
  },
  deletePrincipal: vi.fn(),
}));

vi.mock("../src/db", () => {
  return {
    getExpiredMailboxes: vi.fn(() => []),
    getFailedCleanups: vi.fn(() => []),
    markExpired: vi.fn(),
    markCleanupDone: vi.fn(),
    markCleanupDeadLetter: vi.fn(),
    incrementCleanupAttempts: vi.fn(),
  };
});

import { expireMailbox, runExpirySweep } from "../src/expiry";
import { deletePrincipal, StalwartError } from "../src/stalwart";
import {
  getExpiredMailboxes,
  getFailedCleanups,
  markExpired,
  markCleanupDone,
  markCleanupDeadLetter,
  incrementCleanupAttempts,
} from "../src/db";
import type { MailboxRow } from "../src/db";

function makeRow(overrides: Partial<MailboxRow> = {}): MailboxRow {
  return {
    id: "mbx_test0001",
    stalwart_name: "test0001",
    address: "[email protected]",
    domain: "relay.prim.sh",
    owner_wallet: "0xaaa",
    status: "active",
    password_hash: "fakehash",
    password_enc: "encrypted",
    quota: 0,
    created_at: Date.now() - 100_000,
    expires_at: Date.now() - 1_000, // expired by default
    jmap_api_url: null,
    jmap_account_id: null,
    jmap_identity_id: null,
    jmap_inbox_id: null,
    jmap_drafts_id: null,
    jmap_sent_id: null,
    stalwart_cleanup_failed: 0,
    cleanup_attempts: 0,
    ...overrides,
  };
}

describe("expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("expireMailbox", () => {
    it("no-ops on active row with future expires_at", async () => {
      const row = makeRow({ expires_at: Date.now() + 100_000 });

      await expireMailbox(row);

      expect(deletePrincipal).not.toHaveBeenCalled();
      expect(markExpired).not.toHaveBeenCalled();
    });

    it("deletes principal and marks expired on active row with past expires_at", async () => {
      (deletePrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const row = makeRow();

      await expireMailbox(row);

      expect(deletePrincipal).toHaveBeenCalledWith("test0001");
      expect(markExpired).toHaveBeenCalledWith("mbx_test0001", false);
    });

    it("marks expired without cleanup failure when Stalwart returns 404", async () => {
      (deletePrincipal as ReturnType<typeof vi.fn>).mockRejectedValue(
        new StalwartError(404, "not_found", "Not found"),
      );
      const row = makeRow();

      await expireMailbox(row);

      expect(markExpired).toHaveBeenCalledWith("mbx_test0001", false);
    });

    it("marks expired with cleanup failure when Stalwart returns 502", async () => {
      (deletePrincipal as ReturnType<typeof vi.fn>).mockRejectedValue(
        new StalwartError(502, "stalwart_error", "Server error"),
      );
      const row = makeRow();

      await expireMailbox(row);

      expect(markExpired).toHaveBeenCalledWith("mbx_test0001", true);
    });

    it("no-ops on already-expired row without cleanup failure", async () => {
      const row = makeRow({ status: "expired", stalwart_cleanup_failed: 0 });

      await expireMailbox(row);

      expect(deletePrincipal).not.toHaveBeenCalled();
      expect(markExpired).not.toHaveBeenCalled();
    });

    it("retries on expired row with cleanup failure flag", async () => {
      (deletePrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const row = makeRow({ status: "expired", stalwart_cleanup_failed: 1 });

      await expireMailbox(row);

      expect(deletePrincipal).toHaveBeenCalledWith("test0001");
      expect(markExpired).toHaveBeenCalledWith("mbx_test0001", false);
    });
  });

  describe("runExpirySweep", () => {
    it("processes expired mailboxes and failed cleanups", async () => {
      const expired1 = makeRow({ id: "mbx_1", stalwart_name: "user1" });
      const expired2 = makeRow({ id: "mbx_2", stalwart_name: "user2" });
      const expired3 = makeRow({ id: "mbx_3", stalwart_name: "user3" });
      const failed1 = makeRow({
        id: "mbx_4",
        stalwart_name: "user4",
        status: "expired",
        stalwart_cleanup_failed: 1,
        cleanup_attempts: 0,
      });

      (getExpiredMailboxes as ReturnType<typeof vi.fn>).mockReturnValue([expired1, expired2, expired3]);
      (getFailedCleanups as ReturnType<typeof vi.fn>).mockReturnValue([failed1]);
      (deletePrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const count = await runExpirySweep();

      expect(count).toBe(4);
      expect(deletePrincipal).toHaveBeenCalledTimes(4);
    });

    it("dead-letters failed cleanup at max retries", async () => {
      const failed = makeRow({
        id: "mbx_dead",
        stalwart_name: "dead_user",
        status: "expired",
        stalwart_cleanup_failed: 1,
        cleanup_attempts: 2, // will be 3 after increment → dead letter
      });

      (getExpiredMailboxes as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (getFailedCleanups as ReturnType<typeof vi.fn>).mockReturnValue([failed]);

      const count = await runExpirySweep();

      expect(count).toBe(1);
      expect(incrementCleanupAttempts).toHaveBeenCalledWith("mbx_dead");
      expect(markCleanupDeadLetter).toHaveBeenCalledWith("mbx_dead");
      expect(deletePrincipal).not.toHaveBeenCalled();
    });

    it("returns 0 with no expired mailboxes", async () => {
      (getExpiredMailboxes as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (getFailedCleanups as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const count = await runExpirySweep();

      expect(count).toBe(0);
      expect(deletePrincipal).not.toHaveBeenCalled();
    });

    it("retries failed cleanup and marks done on success", async () => {
      const failed = makeRow({
        id: "mbx_retry",
        stalwart_name: "retry_user",
        status: "expired",
        stalwart_cleanup_failed: 1,
        cleanup_attempts: 1,
      });

      (getExpiredMailboxes as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (getFailedCleanups as ReturnType<typeof vi.fn>).mockReturnValue([failed]);
      (deletePrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await runExpirySweep();

      expect(incrementCleanupAttempts).toHaveBeenCalledWith("mbx_retry");
      expect(deletePrincipal).toHaveBeenCalledWith("retry_user");
      expect(markCleanupDone).toHaveBeenCalledWith("mbx_retry");
    });
  });
});
