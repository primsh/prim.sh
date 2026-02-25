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
  createPrincipal: vi.fn(),
  deletePrincipal: vi.fn(),
  createDomainPrincipal: vi.fn(),
  deleteDomainPrincipal: vi.fn(),
  generateDkim: vi.fn(),
  getDnsRecords: vi.fn(() => []),
}));

vi.mock("../src/crypto", () => ({
  encryptPassword: vi.fn((p: string) => `encrypted:${p}`),
}));

vi.mock("../src/jmap", () => ({
  JmapError: class JmapError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
  discoverSession: vi.fn().mockResolvedValue({
    apiUrl: "https://mail.email.prim.sh/jmap/",
    accountId: "acc_1",
    identityId: "id_1",
    inboxId: "mb_inbox",
    draftsId: "mb_drafts",
    sentId: "mb_sent",
  }),
  buildBasicAuth: vi.fn(() => "Basic mock"),
  queryEmails: vi.fn(),
  getEmail: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("../src/context", () => ({
  getJmapContext: vi.fn(),
}));

vi.mock("../src/expiry", () => ({
  expireMailbox: vi.fn(),
}));

vi.mock("../src/webhook-delivery", () => ({
  verifySignature: vi.fn(() => true),
  dispatchWebhookDeliveries: vi.fn(),
}));

vi.mock("../src/dns-check", () => ({
  verifyDns: vi.fn(),
}));

vi.mock("../src/db", () => {
  const rows = new Map<string, Record<string, unknown>>();
  const domains = new Map<string, Record<string, unknown>>();
  const webhooks = new Map<string, Record<string, unknown>>();
  return {
    insertMailbox: vi.fn((params: Record<string, unknown>) => {
      rows.set(params.id as string, { ...params, status: "active", stalwart_cleanup_failed: 0, cleanup_attempts: 0 });
    }),
    getMailboxById: vi.fn((id: string) => rows.get(id) ?? null),
    getMailboxByAddress: vi.fn(),
    getMailboxesByOwner: vi.fn(() => []),
    getMailboxesByOwnerAll: vi.fn(() => []),
    countMailboxesByOwner: vi.fn(() => 0),
    countMailboxesByOwnerAll: vi.fn(() => 0),
    deleteMailboxRow: vi.fn((id: string) => { rows.delete(id); }),
    updateExpiresAt: vi.fn(),
    insertWebhook: vi.fn(),
    getWebhooksByMailbox: vi.fn(() => []),
    getWebhookById: vi.fn(),
    deleteWebhookRow: vi.fn(),
    insertDomain: vi.fn((params: Record<string, unknown>) => {
      domains.set(params.id as string, {
        ...params,
        status: "pending",
        mx_verified: 0,
        spf_verified: 0,
        dmarc_verified: 0,
        dkim_rsa_record: null,
        dkim_ed_record: null,
        stalwart_provisioned: 0,
        verified_at: null,
      });
    }),
    getDomainById: vi.fn((id: string) => domains.get(id) ?? null),
    getDomainByName: vi.fn((name: string) => {
      return [...domains.values()].find((d) => d.domain === name) ?? null;
    }),
    getDomainsByOwner: vi.fn((owner: string, limit: number, _offset: number) => {
      return [...domains.values()].filter((d) => d.owner_wallet === owner).slice(0, limit);
    }),
    countDomainsByOwner: vi.fn((owner: string) => {
      return [...domains.values()].filter((d) => d.owner_wallet === owner).length;
    }),
    updateDomainVerification: vi.fn((id: string, params: Record<string, boolean>) => {
      const d = domains.get(id);
      if (d) {
        d.mx_verified = params.mx_verified ? 1 : 0;
        d.spf_verified = params.spf_verified ? 1 : 0;
        d.dmarc_verified = params.dmarc_verified ? 1 : 0;
      }
    }),
    updateDomainProvisioned: vi.fn((id: string, params: Record<string, unknown>) => {
      const d = domains.get(id);
      if (d) {
        d.status = "active";
        d.stalwart_provisioned = 1;
        d.dkim_rsa_record = params.dkim_rsa_record;
        d.dkim_ed_record = params.dkim_ed_record;
        d.verified_at = Date.now();
      }
    }),
    deleteDomainRow: vi.fn((id: string) => { domains.delete(id); }),
    countMailboxesByDomain: vi.fn(() => 0),
    _rows: rows,
    _domains: domains,
    _webhooks: webhooks,
  };
});

import {
  registerDomain,
  listDomains,
  getDomain,
  verifyDomain,
  deleteDomain,
  createMailbox,
} from "../src/service";
import { createDomainPrincipal, deleteDomainPrincipal, generateDkim, getDnsRecords, StalwartError } from "../src/stalwart";
import { verifyDns } from "../src/dns-check";
import { createPrincipal } from "../src/stalwart";
import * as dbMock from "../src/db";

const WALLET_A = "0xaaa";
const WALLET_B = "0xbbb";

describe("custom domains (R-9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
    ((dbMock as any)._rows as Map<string, unknown>).clear();
    // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
    ((dbMock as any)._domains as Map<string, unknown>).clear();
    process.env.EMAIL_DEFAULT_DOMAIN = "email.prim.sh";
  });

  describe("registerDomain", () => {
    it("creates domain with dom_ prefix ID and pending status", async () => {
      const result = await registerDomain({ domain: "acme.com" }, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toMatch(/^dom_[0-9a-f]{8}$/);
      expect(result.data.domain).toBe("acme.com");
      expect(result.data.status).toBe("pending");
      expect(result.data.required_records).toHaveLength(3);
      expect(result.data.required_records[0].type).toBe("MX");
    });

    it("rejects reserved domain email.prim.sh", async () => {
      const result = await registerDomain({ domain: "email.prim.sh" }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_request");
    });

    it("rejects reserved domain prim.sh", async () => {
      const result = await registerDomain({ domain: "prim.sh" }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_request");
    });

    it("rejects duplicate domain", async () => {
      await registerDomain({ domain: "acme.com" }, WALLET_A);
      const result = await registerDomain({ domain: "acme.com" }, WALLET_B);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("domain_taken");
    });

    it("rejects invalid domain format", async () => {
      const result = await registerDomain({ domain: "not-a-domain" }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_request");
    });

    it("normalizes domain to lowercase", async () => {
      const result = await registerDomain({ domain: "ACME.COM" }, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.domain).toBe("acme.com");
    });
  });

  describe("listDomains", () => {
    it("returns only caller's domains", async () => {
      await registerDomain({ domain: "acme.com" }, WALLET_A);
      await registerDomain({ domain: "beta.com" }, WALLET_A);
      await registerDomain({ domain: "other.com" }, WALLET_B);

      const result = listDomains(WALLET_A, 1, 25);

      expect(result.total).toBe(2);
      expect(result.domains).toHaveLength(2);
    });
  });

  describe("getDomain", () => {
    it("returns domain owned by caller", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      const result = getDomain(created.data.id, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.domain).toBe("acme.com");
    });

    it("returns not_found for wrong wallet", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      const result = getDomain(created.data.id, WALLET_B);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("not_found");
    });
  });

  describe("verifyDomain", () => {
    it("sets status to active when all DNS checks pass", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      (verifyDns as ReturnType<typeof vi.fn>).mockResolvedValue({
        allPass: true,
        mx: { pass: true, expected: "mail.email.prim.sh", found: "mail.email.prim.sh" },
        spf: { pass: true, expected: "include:email.prim.sh", found: "v=spf1 include:email.prim.sh -all" },
        dmarc: { pass: true, expected: "v=DMARC1", found: "v=DMARC1; p=quarantine" },
      });
      (createDomainPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(42);
      (generateDkim as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "dkim1", algorithm: "RSA", domain: "acme.com", selector: "rsa" });
      (getDnsRecords as ReturnType<typeof vi.fn>).mockResolvedValue([
        { type: "TXT", name: "rsa._domainkey.acme.com", content: "v=DKIM1; k=rsa; p=MIIBIjAN..." },
        { type: "TXT", name: "ed._domainkey.acme.com", content: "v=DKIM1; k=ed25519; p=HAa8..." },
      ]);

      const result = await verifyDomain(created.data.id, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("active");
      expect(result.data.dkim_records).toHaveLength(2);
      expect(createDomainPrincipal).toHaveBeenCalledWith("acme.com");
      expect(generateDkim).toHaveBeenCalledTimes(2);
    });

    it("returns pending with verification_results when MX missing", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      (verifyDns as ReturnType<typeof vi.fn>).mockResolvedValue({
        allPass: false,
        mx: { pass: false, expected: "mail.email.prim.sh", found: null },
        spf: { pass: true, expected: "include:email.prim.sh", found: "v=spf1 include:email.prim.sh -all" },
        dmarc: { pass: true, expected: "v=DMARC1", found: "v=DMARC1; p=quarantine" },
      });

      const result = await verifyDomain(created.data.id, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("pending");
      expect(result.data.verification_results).toBeDefined();
      const mx = result.data.verification_results?.find((r) => r.type === "MX");
      expect(mx?.pass).toBe(false);
      expect(createDomainPrincipal).not.toHaveBeenCalled();
    });

    it("returns pending when SPF missing", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      (verifyDns as ReturnType<typeof vi.fn>).mockResolvedValue({
        allPass: false,
        mx: { pass: true, expected: "mail.email.prim.sh", found: "mail.email.prim.sh" },
        spf: { pass: false, expected: "include:email.prim.sh", found: null },
        dmarc: { pass: true, expected: "v=DMARC1", found: "v=DMARC1; p=quarantine" },
      });

      const result = await verifyDomain(created.data.id, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("pending");
    });

    it("returns error for already verified domain", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      // Manually set domain to active
      // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
      const d = ((dbMock as any)._domains as Map<string, Record<string, unknown>>).get(created.data.id);
      if (d) d.status = "active";

      const result = await verifyDomain(created.data.id, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("already_verified");
    });

    it("returns not_found for wrong wallet", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      const result = await verifyDomain(created.data.id, WALLET_B);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("not_found");
    });

    it("rolls back domain principal if DKIM generation fails", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      (verifyDns as ReturnType<typeof vi.fn>).mockResolvedValue({
        allPass: true,
        mx: { pass: true, expected: "mail.email.prim.sh", found: "mail.email.prim.sh" },
        spf: { pass: true, expected: "include:email.prim.sh", found: "v=spf1 include:email.prim.sh -all" },
        dmarc: { pass: true, expected: "v=DMARC1", found: "v=DMARC1; p=quarantine" },
      });
      (createDomainPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(42);
      (generateDkim as ReturnType<typeof vi.fn>).mockRejectedValue(
        new StalwartError(500, "stalwart_error", "DKIM failed"),
      );

      const result = await verifyDomain(created.data.id, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain("DKIM");
      expect(deleteDomainPrincipal).toHaveBeenCalledWith("acme.com");
    });
  });

  describe("deleteDomain", () => {
    it("deletes domain and returns success", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      const result = await deleteDomain(created.data.id, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.deleted).toBe(true);
    });

    it("returns not_found for wrong wallet", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      const result = await deleteDomain(created.data.id, WALLET_B);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("not_found");
    });

    it("deletes Stalwart principal for provisioned domains", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      // Mark as provisioned
      // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
      const d = ((dbMock as any)._domains as Map<string, Record<string, unknown>>).get(created.data.id);
      if (d) d.stalwart_provisioned = 1;

      (deleteDomainPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await deleteDomain(created.data.id, WALLET_A);

      expect(result.ok).toBe(true);
      expect(deleteDomainPrincipal).toHaveBeenCalledWith("acme.com");
    });

    it("warns about active mailboxes on domain", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      (dbMock.countMailboxesByDomain as ReturnType<typeof vi.fn>).mockReturnValue(3);

      const result = await deleteDomain(created.data.id, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.warning).toContain("3 active mailboxes");
    });
  });

  describe("createMailbox with custom domain", () => {
    it("allows mailbox creation on active custom domain", async () => {
      // Register and verify domain
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      // Manually set domain to active
      // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
      const d = ((dbMock as any)._domains as Map<string, Record<string, unknown>>).get(created.data.id);
      if (d) d.status = "active";

      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const result = await createMailbox({ domain: "acme.com" }, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.domain).toBe("acme.com");
      expect(result.data.address).toContain("@acme.com");
    });

    it("rejects mailbox on pending domain", async () => {
      await registerDomain({ domain: "acme.com" }, WALLET_A);

      const result = await createMailbox({ domain: "acme.com" }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("domain_not_verified");
    });

    it("rejects mailbox on domain owned by different wallet", async () => {
      const created = await registerDomain({ domain: "acme.com" }, WALLET_A);
      if (!created.ok) return;

      // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
      const d = ((dbMock as any)._domains as Map<string, Record<string, unknown>>).get(created.data.id);
      if (d) d.status = "active";

      const result = await createMailbox({ domain: "acme.com" }, WALLET_B);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_request");
    });

    it("still allows email.prim.sh domain", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const result = await createMailbox({}, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.domain).toBe("email.prim.sh");
    });
  });
});
