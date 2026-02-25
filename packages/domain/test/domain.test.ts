/**
 * D-1/D-2 domain.sh tests: zone + record CRUD with ownership enforcement, domain search.
 *
 * Tests the service layer directly (same pattern as spawn.sh).
 * x402 middleware is tested separately in @agentstack/x402-middleware.
 *
 * IMPORTANT: env vars must be set before any module import that touches db/cloudflare.
 */

import { describe, expect, it, beforeEach, afterEach, vi, type MockInstance } from "vitest";

// Set env before imports
process.env.DOMAIN_DB_PATH = ":memory:";
process.env.CLOUDFLARE_API_TOKEN = "test-cf-token";
process.env.CLOUDFLARE_ACCOUNT_ID = "test-cf-account";

// ─── Cloudflare API mock helpers ─────────────────────────────────────────

function makeCfZone(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "cf-zone-001",
    name: "example.com",
    status: "pending",
    name_servers: ["ns1.cloudflare.com", "ns2.cloudflare.com"],
    created_on: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeCfRecord(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "cf-record-001",
    zone_id: "cf-zone-001",
    type: "A",
    name: "example.com",
    content: "1.2.3.4",
    ttl: 3600,
    proxied: false,
    priority: null,
    created_on: "2024-01-01T00:00:00Z",
    modified_on: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

// Configurable GET /dns_records response — set per-test for idempotency scenarios
let cfDnsRecordsMock: Record<string, unknown>[] = [];

// Mock fetch: intercepts Cloudflare API calls
const mockFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : (input as URL).toString();
  const method = _init?.method ?? "GET";

  // CF: GET /zones/:id/dns_records — list records (configurable per-test, default empty)
  if (url.match(/\/client\/v4\/zones\/[^/]+\/dns_records(\?.*)?$/) && method === "GET") {
    return new Response(
      JSON.stringify({ success: true, errors: [], result: cfDnsRecordsMock }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // CF: POST /zones — create zone
  if (url === "https://api.cloudflare.com/client/v4/zones" && method === "POST") {
    const body = JSON.parse(_init?.body as string);
    return new Response(
      JSON.stringify({ success: true, errors: [], result: makeCfZone({ name: body.name }) }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // CF: DELETE /zones/:id — delete zone
  if (url.match(/\/client\/v4\/zones\/[^/]+$/) && method === "DELETE") {
    return new Response(
      JSON.stringify({ success: true, errors: [], result: { id: "cf-zone-001" } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // CF: POST /zones/:id/dns_records — create record
  if (url.match(/\/client\/v4\/zones\/[^/]+\/dns_records$/) && method === "POST") {
    const body = JSON.parse(_init?.body as string);
    return new Response(
      JSON.stringify({
        success: true,
        errors: [],
        result: makeCfRecord({
          type: body.type,
          name: body.name,
          content: body.content,
          ttl: body.ttl ?? 3600,
          proxied: body.proxied ?? false,
          priority: body.priority ?? null,
        }),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // CF: PUT /zones/:id/dns_records/:id — update record
  if (url.match(/\/client\/v4\/zones\/[^/]+\/dns_records\/[^/]+$/) && method === "PUT") {
    const body = JSON.parse(_init?.body as string);
    return new Response(
      JSON.stringify({
        success: true,
        errors: [],
        result: makeCfRecord({
          type: body.type,
          name: body.name,
          content: body.content,
          ttl: body.ttl ?? 3600,
          proxied: body.proxied ?? false,
          priority: body.priority ?? null,
          modified_on: "2024-01-02T00:00:00Z",
        }),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // CF: POST /zones/:id/dns_records/batch — batch record operations
  if (url.match(/\/client\/v4\/zones\/[^/]+\/dns_records\/batch$/) && method === "POST") {
    const body = JSON.parse(_init?.body as string) as {
      posts?: { type: string; name: string; content: string; ttl?: number; proxied?: boolean; priority?: number }[];
      patches?: { id: string; content?: string; ttl?: number; type?: string; name?: string; proxied?: boolean; priority?: number }[];
      deletes?: { id: string }[];
    };
    const posts = (body.posts ?? []).map((p, i) =>
      makeCfRecord({ id: `cf-record-batch-post-${i}`, type: p.type, name: p.name, content: p.content, ttl: p.ttl ?? 3600, proxied: p.proxied ?? false, priority: p.priority ?? null }),
    );
    const patches = (body.patches ?? []).map((p) =>
      makeCfRecord({ id: p.id, type: p.type ?? "A", name: p.name ?? "example.com", content: p.content ?? "patched", ttl: p.ttl ?? 3600, proxied: p.proxied ?? false, priority: p.priority ?? null }),
    );
    const deletes = (body.deletes ?? []).map((d) => makeCfRecord({ id: d.id }));
    return new Response(
      JSON.stringify({ success: true, errors: [], result: { posts, patches, puts: [], deletes } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // CF: DELETE /zones/:id/dns_records/:id — delete record
  if (url.match(/\/client\/v4\/zones\/[^/]+\/dns_records\/[^/]+$/) && method === "DELETE") {
    return new Response(
      JSON.stringify({ success: true, errors: [], result: { id: "cf-record-001" } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

vi.stubGlobal("fetch", mockFetch);

// ─── DNS mock (node:dns/promises Resolver) ────────────────────────────────

// Per-method return values, configurable per-test
const dnsResolverMock = {
  resolve4: vi.fn<() => Promise<string[]>>(),
  resolve6: vi.fn<() => Promise<string[]>>(),
  resolveCname: vi.fn<() => Promise<string[]>>(),
  resolveMx: vi.fn<() => Promise<{ priority: number; exchange: string }[]>>(),
  resolveTxt: vi.fn<() => Promise<string[][]>>(),
  resolveNs: vi.fn<() => Promise<string[]>>(),
  resolveSrv: vi.fn<() => Promise<{ name: string; port: number; priority: number; weight: number }[]>>(),
  resolveCaa: vi.fn<() => Promise<unknown[]>>(),
  setServers: vi.fn(),
};

vi.mock("node:dns/promises", () => ({
  Resolver: vi.fn(() => dnsResolverMock),
}));

// Import after env + fetch stub
import { resetDb, getZoneById, getRecordById, getRecordsByZone } from "../src/db.ts";
import {
  createZone,
  listZones,
  getZone,
  deleteZone,
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
  searchDomains,
  batchRecords,
  mailSetup,
  verifyZone,
} from "../src/service.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────

const CALLER = "0xCa11e900000000000000000000000000000000001";
const OTHER = "0xCa11e900000000000000000000000000000000002";

// ─── Tests ───────────────────────────────────────────────────────────────

describe("domain.sh", () => {
  beforeEach(() => {
    resetDb();
    mockFetch.mockClear();
    cfDnsRecordsMock = [];
    // Reset DNS resolver mocks
    Object.values(dnsResolverMock).forEach((m) => (m as MockInstance).mockReset());
  });

  afterEach(() => {
    resetDb();
  });

  // ─── Zone CRUD ───────────────────────────────────────────────────────

  describe("zones", () => {
    it("create zone — returns zone with id and nameservers", async () => {
      const result = await createZone({ domain: "example.com" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.zone.id).toMatch(/^z_/);
      expect(result.data.zone.domain).toBe("example.com");
      expect(result.data.zone.owner_wallet).toBe(CALLER);
      expect(result.data.zone.name_servers).toHaveLength(2);
    });

    it("create zone — persists to DB", async () => {
      const result = await createZone({ domain: "example.com" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = getZoneById(result.data.zone.id);
      expect(row).not.toBeNull();
      expect(row?.domain).toBe("example.com");
      expect(row?.cloudflare_id).toBe("cf-zone-001");
    });

    it("create zone — invalid domain returns error", async () => {
      const result = await createZone({ domain: "not-a-domain" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    });

    it("create zone — empty domain returns error", async () => {
      const result = await createZone({ domain: "" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("create zone — domain with protocol returns error", async () => {
      const result = await createZone({ domain: "https://example.com" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("create zone — duplicate domain returns error", async () => {
      await createZone({ domain: "example.com" }, CALLER);
      const result = await createZone({ domain: "example.com" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("domain_taken");
    });

    it("list zones — returns only caller's zones", async () => {
      // Create zones for two wallets
      await createZone({ domain: "a-domain.com" }, CALLER);
      await createZone({ domain: "b-domain.com" }, OTHER);

      const list = listZones(CALLER, 20, 1);
      expect(list.zones).toHaveLength(1);
      expect(list.zones[0].domain).toBe("a-domain.com");
      expect(list.meta.total).toBe(1);
    });

    it("list zones — pagination works", async () => {
      await createZone({ domain: "first.com" }, CALLER);
      await createZone({ domain: "second.com" }, CALLER);
      await createZone({ domain: "third.com" }, CALLER);

      const page1 = listZones(CALLER, 2, 1);
      expect(page1.zones).toHaveLength(2);
      expect(page1.meta.total).toBe(3);

      const page2 = listZones(CALLER, 2, 2);
      expect(page2.zones).toHaveLength(1);
    });

    it("get zone — owner can access", async () => {
      const created = await createZone({ domain: "example.com" }, CALLER);
      if (!created.ok) return;

      const result = getZone(created.data.zone.id, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.domain).toBe("example.com");
    });

    it("get zone — non-owner gets 403", async () => {
      const created = await createZone({ domain: "example.com" }, CALLER);
      if (!created.ok) return;

      const result = getZone(created.data.zone.id, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("get zone — nonexistent returns 404", () => {
      const result = getZone("z_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("delete zone — owner can delete", async () => {
      const created = await createZone({ domain: "example.com" }, CALLER);
      if (!created.ok) return;

      const result = await deleteZone(created.data.zone.id, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("deleted");

      // Verify gone from DB
      const row = getZoneById(created.data.zone.id);
      expect(row).toBeNull();
    });

    it("delete zone — non-owner gets 403", async () => {
      const created = await createZone({ domain: "example.com" }, CALLER);
      if (!created.ok) return;

      const result = await deleteZone(created.data.zone.id, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("delete zone — nonexistent returns 404", async () => {
      const result = await deleteZone("z_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });
  });

  // ─── Record CRUD ─────────────────────────────────────────────────────

  describe("records", () => {
    let zoneId: string;

    beforeEach(async () => {
      const result = await createZone({ domain: "example.com" }, CALLER);
      if (!result.ok) throw new Error("Failed to create test zone");
      zoneId = result.data.zone.id;
    });

    it("create record — returns record with id", async () => {
      const result = await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toMatch(/^r_/);
      expect(result.data.type).toBe("A");
      expect(result.data.content).toBe("1.2.3.4");
      expect(result.data.ttl).toBe(3600);
    });

    it("create record — persists to DB", async () => {
      const result = await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      if (!result.ok) return;
      const row = getRecordById(result.data.id);
      expect(row).not.toBeNull();
      expect(row?.cloudflare_id).toBe("cf-record-001");
    });

    it("create record — invalid type returns error", async () => {
      const result = await createRecord(zoneId, { type: "INVALID" as "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("create record — missing name returns error", async () => {
      const result = await createRecord(zoneId, { type: "A", name: "", content: "1.2.3.4" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("create record — missing content returns error", async () => {
      const result = await createRecord(zoneId, { type: "A", name: "example.com", content: "" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("create MX record — missing priority returns error", async () => {
      const result = await createRecord(zoneId, { type: "MX", name: "example.com", content: "mail.example.com" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.message).toContain("priority");
    });

    it("create MX record — with priority succeeds", async () => {
      const result = await createRecord(zoneId, { type: "MX", name: "example.com", content: "mail.example.com", priority: 10 }, CALLER);
      expect(result.ok).toBe(true);
    });

    it("create record — non-owner of zone gets 403", async () => {
      const result = await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("create record — nonexistent zone returns 404", async () => {
      const result = await createRecord("z_nonexist", { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("list records — returns records for zone", async () => {
      await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      await createRecord(zoneId, { type: "AAAA", name: "example.com", content: "::1" }, CALLER);

      const result = listRecords(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records).toHaveLength(2);
    });

    it("list records — non-owner gets 403", () => {
      const result = listRecords(zoneId, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("get record — returns specific record", async () => {
      const created = await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      if (!created.ok) return;

      const result = getRecord(zoneId, created.data.id, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.content).toBe("1.2.3.4");
    });

    it("get record — nonexistent returns 404", () => {
      const result = getRecord(zoneId, "r_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("update record — changes content", async () => {
      const created = await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      if (!created.ok) return;

      const result = await updateRecord(zoneId, created.data.id, { content: "5.6.7.8" }, CALLER);
      expect(result.ok).toBe(true);
    });

    it("update record — non-owner gets 403", async () => {
      const created = await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      if (!created.ok) return;

      const result = await updateRecord(zoneId, created.data.id, { content: "5.6.7.8" }, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("update record — nonexistent returns 404", async () => {
      const result = await updateRecord(zoneId, "r_nonexist", { content: "5.6.7.8" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("delete record — owner can delete", async () => {
      const created = await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      if (!created.ok) return;

      const result = await deleteRecord(zoneId, created.data.id, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("deleted");

      // Verify gone
      const row = getRecordById(created.data.id);
      expect(row).toBeNull();
    });

    it("delete record — non-owner gets 403", async () => {
      const created = await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      if (!created.ok) return;

      const result = await deleteRecord(zoneId, created.data.id, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("delete record — nonexistent returns 404", async () => {
      const result = await deleteRecord(zoneId, "r_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("delete zone — also deletes its records", async () => {
      await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);

      await deleteZone(zoneId, CALLER);

      const records = getRecordsByZone(zoneId);
      expect(records).toHaveLength(0);
    });
  });

  // ─── Cloudflare error propagation ────────────────────────────────────

  describe("cloudflare errors", () => {
    it("CF 429 → service returns rate_limited", async () => {
      mockFetch.mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({ success: false, errors: [{ code: 429, message: "Rate limited" }] }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await createZone({ domain: "ratelimited.com" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("rate_limited");
    });
  });

  // ─── Mail setup ───────────────────────────────────────────────────────

  describe("mail setup", () => {
    let zoneId: string;

    beforeEach(async () => {
      const result = await createZone({ domain: "example.com" }, CALLER);
      if (!result.ok) throw new Error("Failed to create test zone");
      zoneId = result.data.zone.id;
    });

    it("creates 4 records when no DKIM provided", async () => {
      const result = await mailSetup(
        zoneId,
        { mail_server: "mail.example.com", mail_server_ip: "1.2.3.4" },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records).toHaveLength(4);
      expect(result.data.records.every((r) => r.action === "created")).toBe(true);
    });

    it("creates 6 records when both DKIM keys provided", async () => {
      const result = await mailSetup(
        zoneId,
        {
          mail_server: "mail.example.com",
          mail_server_ip: "1.2.3.4",
          dkim: {
            rsa: { selector: "rsa", public_key: "MIIBIjAN..." },
            ed25519: { selector: "ed", public_key: "HAa8Xaz..." },
          },
        },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records).toHaveLength(6);
    });

    it("creates 5 records with RSA DKIM only", async () => {
      const result = await mailSetup(
        zoneId,
        {
          mail_server: "mail.example.com",
          mail_server_ip: "1.2.3.4",
          dkim: { rsa: { selector: "rsa", public_key: "MIIBIjAN..." } },
        },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records).toHaveLength(5);
    });

    it("creates 5 records with Ed25519 DKIM only", async () => {
      const result = await mailSetup(
        zoneId,
        {
          mail_server: "mail.example.com",
          mail_server_ip: "1.2.3.4",
          dkim: { ed25519: { selector: "ed", public_key: "HAa8Xaz..." } },
        },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records).toHaveLength(5);
    });

    it("record names use correct FQDNs", async () => {
      const result = await mailSetup(
        zoneId,
        {
          mail_server: "mail.example.com",
          mail_server_ip: "1.2.3.4",
          dkim: { rsa: { selector: "rsa", public_key: "pubkey" } },
        },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.data.records.map((r) => r.name);
      expect(names).toContain("mail.example.com");   // A record
      expect(names).toContain("example.com");         // MX + SPF
      expect(names).toContain("_dmarc.example.com");  // DMARC
      expect(names).toContain("rsa._domainkey.example.com"); // DKIM
    });

    it("idempotent — updates existing A record instead of creating", async () => {
      // All GETs return an existing A record; only the A matchFn matches it
      cfDnsRecordsMock = [makeCfRecord({ id: "cf-existing-a", type: "A", name: "mail.example.com", content: "9.9.9.9" })];

      const result = await mailSetup(
        zoneId,
        { mail_server: "mail.example.com", mail_server_ip: "1.2.3.4" },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const a = result.data.records.find((r) => r.name === "mail.example.com");
      expect(a?.action).toBe("updated");
      // Other records are created (their matchFns don't match an A record)
      const others = result.data.records.filter((r) => r.name !== "mail.example.com");
      expect(others.every((r) => r.action === "created")).toBe(true);
    });

    it("idempotent — updates existing SPF without touching other TXT records", async () => {
      // All GETs return SPF + unrelated TXT; only the SPF matchFn matches
      cfDnsRecordsMock = [
        makeCfRecord({ id: "cf-spf-01", type: "TXT", name: "example.com", content: "v=spf1 a:old.server.com -all" }),
        makeCfRecord({ id: "cf-verify-01", type: "TXT", name: "example.com", content: "google-site-verification=abc123" }),
      ];

      const result = await mailSetup(
        zoneId,
        { mail_server: "mail.example.com", mail_server_ip: "1.2.3.4" },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // SPF record should be updated
      const spf = result.data.records.find((r) => r.name === "example.com" && r.type === "TXT");
      expect(spf?.action).toBe("updated");

      // Only one PUT (for SPF); the unrelated TXT is left untouched
      const putCalls = mockFetch.mock.calls.filter(
        ([_url, init]) => init?.method === "PUT",
      );
      expect(putCalls).toHaveLength(1);
    });

    it("idempotent — does not match unrelated TXT as SPF", async () => {
      // All GETs return only an unrelated TXT — SPF matchFn won't match it
      cfDnsRecordsMock = [
        makeCfRecord({ id: "cf-verify-01", type: "TXT", name: "example.com", content: "google-site-verification=abc123" }),
      ];

      const result = await mailSetup(
        zoneId,
        { mail_server: "mail.example.com", mail_server_ip: "1.2.3.4" },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // SPF should be created (not update the unrelated TXT)
      const spf = result.data.records.find((r) => r.name === "example.com" && r.type === "TXT");
      expect(spf?.action).toBe("created");
    });

    it("returns 400 when mail_server_ip is missing", async () => {
      const result = await mailSetup(
        zoneId,
        { mail_server: "mail.example.com", mail_server_ip: "" },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.message).toContain("mail_server_ip");
    });

    it("returns 400 when mail_server is missing", async () => {
      const result = await mailSetup(
        zoneId,
        { mail_server: "", mail_server_ip: "1.2.3.4" },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.message).toContain("mail_server");
    });

    it("non-owner gets 403", async () => {
      const result = await mailSetup(
        zoneId,
        { mail_server: "mail.example.com", mail_server_ip: "1.2.3.4" },
        OTHER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("nonexistent zone returns 404", async () => {
      const result = await mailSetup(
        "z_nonexistent",
        { mail_server: "mail.example.com", mail_server_ip: "1.2.3.4" },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("CF error propagates", async () => {
      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ success: false, errors: [{ code: 9109, message: "Invalid record type" }] }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await mailSetup(
        zoneId,
        { mail_server: "mail.example.com", mail_server_ip: "1.2.3.4" },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });
  });

  // ─── Batch record operations ──────────────────────────────────────────

  describe("batch records", () => {
    let zoneId: string;

    beforeEach(async () => {
      const result = await createZone({ domain: "example.com" }, CALLER);
      if (!result.ok) throw new Error("Failed to create test zone");
      zoneId = result.data.zone.id;
    });

    it("batch create — creates records and returns them", async () => {
      const result = await batchRecords(
        zoneId,
        { create: [{ type: "A", name: "www.example.com", content: "1.2.3.4" }] },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.created).toHaveLength(1);
      expect(result.data.created[0].id).toMatch(/^r_/);
      expect(result.data.created[0].type).toBe("A");
      expect(result.data.updated).toHaveLength(0);
      expect(result.data.deleted).toHaveLength(0);
    });

    it("batch create — persists records to DB", async () => {
      const result = await batchRecords(
        zoneId,
        { create: [{ type: "TXT", name: "example.com", content: "v=spf1 -all" }] },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = getRecordById(result.data.created[0].id);
      expect(row).not.toBeNull();
    });

    it("batch create — MX without priority returns 400", async () => {
      const result = await batchRecords(
        zoneId,
        { create: [{ type: "MX", name: "example.com", content: "mail.example.com" }] },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.message).toContain("priority");
    });

    it("batch create — MX with priority succeeds", async () => {
      const result = await batchRecords(
        zoneId,
        { create: [{ type: "MX", name: "example.com", content: "mail.example.com", priority: 10 }] },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.created[0].priority).toBe(10);
    });

    it("batch create — invalid type returns 400", async () => {
      const result = await batchRecords(
        zoneId,
        { create: [{ type: "INVALID" as "A", name: "example.com", content: "1.2.3.4" }] },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("batch create — missing name returns 400", async () => {
      const result = await batchRecords(
        zoneId,
        { create: [{ type: "A", name: "", content: "1.2.3.4" }] },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("batch create — missing content returns 400", async () => {
      const result = await batchRecords(
        zoneId,
        { create: [{ type: "A", name: "example.com", content: "" }] },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("batch update — updates record content", async () => {
      const created = await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      if (!created.ok) return;

      const result = await batchRecords(
        zoneId,
        { update: [{ id: created.data.id, content: "5.6.7.8" }] },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.created).toHaveLength(0);
      expect(result.data.updated).toHaveLength(1);
      expect(result.data.updated[0].id).toBe(created.data.id);
      expect(result.data.updated[0].content).toBe("5.6.7.8");
    });

    it("batch update — nonexistent record ID returns 404", async () => {
      const result = await batchRecords(
        zoneId,
        { update: [{ id: "r_nonexistent", content: "1.2.3.4" }] },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("batch update — record from different zone returns 404", async () => {
      // Create a second zone and a record in it
      const otherZone = await createZone({ domain: "other.com" }, CALLER);
      if (!otherZone.ok) return;
      const otherRecord = await createRecord(otherZone.data.zone.id, { type: "A", name: "other.com", content: "1.2.3.4" }, CALLER);
      if (!otherRecord.ok) return;

      // Try to update it via the first zone
      const result = await batchRecords(
        zoneId,
        { update: [{ id: otherRecord.data.id, content: "9.9.9.9" }] },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("batch delete — removes records and returns deleted IDs", async () => {
      const created = await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      if (!created.ok) return;
      const recordId = created.data.id;

      const result = await batchRecords(
        zoneId,
        { delete: [{ id: recordId }] },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.deleted).toHaveLength(1);
      expect(result.data.deleted[0].id).toBe(recordId);

      // Verify removed from DB
      expect(getRecordById(recordId)).toBeNull();
    });

    it("batch delete — nonexistent record ID returns 404", async () => {
      const result = await batchRecords(
        zoneId,
        { delete: [{ id: "r_nonexistent" }] },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("mixed batch — create + delete together", async () => {
      const created = await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      if (!created.ok) return;

      const result = await batchRecords(
        zoneId,
        {
          create: [{ type: "AAAA", name: "example.com", content: "::1" }],
          delete: [{ id: created.data.id }],
        },
        CALLER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.created).toHaveLength(1);
      expect(result.data.deleted).toHaveLength(1);
      expect(getRecordById(created.data.id)).toBeNull();
    });

    it("batch — non-owner of zone gets 403", async () => {
      const result = await batchRecords(
        zoneId,
        { create: [{ type: "A", name: "example.com", content: "1.2.3.4" }] },
        OTHER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("batch — nonexistent zone returns 404", async () => {
      const result = await batchRecords(
        "z_nonexistent",
        { create: [{ type: "A", name: "example.com", content: "1.2.3.4" }] },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("batch — empty request returns 400", async () => {
      const result = await batchRecords(zoneId, {}, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("batch — exceeds 200 operation limit returns 400", async () => {
      const creates = Array.from({ length: 201 }, (_, i) => ({
        type: "A" as const,
        name: `record${i}.example.com`,
        content: "1.2.3.4",
      }));
      const result = await batchRecords(zoneId, { create: creates }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.message).toContain("200");
    });

    it("batch — exactly 200 operations is allowed", async () => {
      const creates = Array.from({ length: 200 }, (_, i) => ({
        type: "A" as const,
        name: `record${i}.example.com`,
        content: "1.2.3.4",
      }));
      const result = await batchRecords(zoneId, { create: creates }, CALLER);
      expect(result.ok).toBe(true);
    });

    it("batch — CF error propagates as cloudflare_error", async () => {
      mockFetch.mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({ success: false, errors: [{ code: 1000, message: "CF batch failed" }] }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await batchRecords(
        zoneId,
        { create: [{ type: "A", name: "example.com", content: "1.2.3.4" }] },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("cloudflare_error");
    });
  });

  // ─── Zone verification ────────────────────────────────────────────────────

  describe("zone verify", () => {
    let zoneId: string;

    beforeEach(async () => {
      const result = await createZone({ domain: "example.com" }, CALLER);
      if (!result.ok) throw new Error("Failed to create test zone");
      zoneId = result.data.zone.id;
      // Default DNS mock: NS resolves correctly, resolve4 returns an IP (for NS IP lookups)
      dnsResolverMock.resolveNs.mockResolvedValue(["ns1.cloudflare.com", "ns2.cloudflare.com"]);
      dnsResolverMock.resolve4.mockResolvedValue(["1.1.1.1"]);
    });

    it("non-owner gets 403", async () => {
      const result = await verifyZone(zoneId, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("nonexistent zone returns 404", async () => {
      const result = await verifyZone("z_nonexistent", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("NS propagated — exact match (same order)", async () => {
      dnsResolverMock.resolveNs.mockResolvedValue(["ns1.cloudflare.com", "ns2.cloudflare.com"]);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.nameservers.propagated).toBe(true);
    });

    it("NS propagated — order-independent match", async () => {
      dnsResolverMock.resolveNs.mockResolvedValue(["ns2.cloudflare.com", "ns1.cloudflare.com"]);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.nameservers.propagated).toBe(true);
    });

    it("NS not propagated — different NS returned", async () => {
      dnsResolverMock.resolveNs.mockResolvedValue(["ns1.registrar.com", "ns2.registrar.com"]);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.nameservers.propagated).toBe(false);
    });

    it("NS ETIMEOUT → actual is [error:timeout], propagated false", async () => {
      const err = Object.assign(new Error("timeout"), { code: "ETIMEOUT" });
      dnsResolverMock.resolveNs.mockRejectedValue(err);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.nameservers.propagated).toBe(false);
      expect(result.data.nameservers.actual).toEqual(["error:timeout"]);
    });

    it("zone with no records returns empty records array", async () => {
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records).toHaveLength(0);
    });

    it("all_propagated true when NS and all records propagated", async () => {
      await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      dnsResolverMock.resolveNs.mockResolvedValue(["ns1.cloudflare.com", "ns2.cloudflare.com"]);
      dnsResolverMock.resolve4
        .mockResolvedValueOnce(["1.1.1.1"]) // ns1 IP
        .mockResolvedValueOnce(["1.0.0.1"]) // ns2 IP
        .mockResolvedValueOnce(["1.2.3.4"]); // A record
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.all_propagated).toBe(true);
    });

    it("all_propagated false when NS propagated but record is not", async () => {
      await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      dnsResolverMock.resolve4
        .mockResolvedValueOnce(["1.1.1.1"]) // ns1 IP
        .mockResolvedValueOnce(["1.0.0.1"]) // ns2 IP
        .mockResolvedValueOnce(["9.9.9.9"]); // A record — wrong
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.all_propagated).toBe(false);
    });

    it("A record propagated — content in resolve4 results", async () => {
      await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      dnsResolverMock.resolve4
        .mockResolvedValueOnce(["1.1.1.1"])
        .mockResolvedValueOnce(["1.0.0.1"])
        .mockResolvedValueOnce(["1.2.3.4"]);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records[0].propagated).toBe(true);
      expect(result.data.records[0].actual).toBe("1.2.3.4");
    });

    it("A record not propagated — wrong IP returned", async () => {
      await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      dnsResolverMock.resolve4
        .mockResolvedValueOnce(["1.1.1.1"])
        .mockResolvedValueOnce(["1.0.0.1"])
        .mockResolvedValueOnce(["9.9.9.9"]);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records[0].propagated).toBe(false);
      expect(result.data.records[0].actual).toBe("9.9.9.9");
    });

    it("A record ENOTFOUND → actual null, propagated false", async () => {
      await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      const err = Object.assign(new Error("not found"), { code: "ENOTFOUND" });
      dnsResolverMock.resolve4
        .mockResolvedValueOnce(["1.1.1.1"])
        .mockResolvedValueOnce(["1.0.0.1"])
        .mockRejectedValueOnce(err);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records[0].propagated).toBe(false);
      expect(result.data.records[0].actual).toBeNull();
    });

    it("A record ETIMEOUT → actual error:timeout", async () => {
      await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      const err = Object.assign(new Error("timeout"), { code: "ETIMEOUT" });
      dnsResolverMock.resolve4
        .mockResolvedValueOnce(["1.1.1.1"])
        .mockResolvedValueOnce(["1.0.0.1"])
        .mockRejectedValueOnce(err);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records[0].actual).toBe("error:timeout");
    });

    it("A record ECONNREFUSED → actual error:unreachable", async () => {
      await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      const err = Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
      dnsResolverMock.resolve4
        .mockResolvedValueOnce(["1.1.1.1"])
        .mockResolvedValueOnce(["1.0.0.1"])
        .mockRejectedValueOnce(err);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records[0].actual).toBe("error:unreachable");
    });

    it("TXT chunks joined before comparison — propagated true", async () => {
      await createRecord(zoneId, { type: "TXT", name: "example.com", content: "v=spf1 a:mail.example.com -all" }, CALLER);
      dnsResolverMock.resolve4
        .mockResolvedValueOnce(["1.1.1.1"])
        .mockResolvedValueOnce(["1.0.0.1"]);
      dnsResolverMock.resolveTxt.mockResolvedValue([["v=spf1 ", "a:mail.example.com -all"]]);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records[0].propagated).toBe(true);
    });

    it("TXT different content → propagated false", async () => {
      await createRecord(zoneId, { type: "TXT", name: "example.com", content: "v=spf1 a:mail.example.com -all" }, CALLER);
      dnsResolverMock.resolve4
        .mockResolvedValueOnce(["1.1.1.1"])
        .mockResolvedValueOnce(["1.0.0.1"]);
      dnsResolverMock.resolveTxt.mockResolvedValue([["v=spf1 old -all"]]);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records[0].propagated).toBe(false);
    });

    it("MX exchange + priority match → propagated true", async () => {
      await createRecord(zoneId, { type: "MX", name: "example.com", content: "mail.example.com", priority: 10 }, CALLER);
      dnsResolverMock.resolve4
        .mockResolvedValueOnce(["1.1.1.1"])
        .mockResolvedValueOnce(["1.0.0.1"]);
      dnsResolverMock.resolveMx.mockResolvedValue([{ priority: 10, exchange: "mail.example.com" }]);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records[0].propagated).toBe(true);
    });

    it("MX exchange matches but priority differs → propagated false", async () => {
      await createRecord(zoneId, { type: "MX", name: "example.com", content: "mail.example.com", priority: 10 }, CALLER);
      dnsResolverMock.resolve4
        .mockResolvedValueOnce(["1.1.1.1"])
        .mockResolvedValueOnce(["1.0.0.1"]);
      dnsResolverMock.resolveMx.mockResolvedValue([{ priority: 20, exchange: "mail.example.com" }]);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records[0].propagated).toBe(false);
    });

    it("NS IPs unresolvable → all records get error:ns_unresolvable", async () => {
      await createRecord(zoneId, { type: "A", name: "example.com", content: "1.2.3.4" }, CALLER);
      const err = Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
      dnsResolverMock.resolve4.mockRejectedValue(err);
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.records[0].actual).toBe("error:ns_unresolvable");
      expect(result.data.records[0].propagated).toBe(false);
    });
  });

  // ─── Domain search ────────────────────────────────────────────────────

  describe("domain search", () => {
    afterEach(() => {
      process.env.NAMESILO_API_KEY = "";
    });

    it("returns 503 when NAMESILO_API_KEY is not set", async () => {
      process.env.NAMESILO_API_KEY = "";
      const result = await searchDomains("example", ["com"]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(503);
      expect(result.code).toBe("registrar_unavailable");
    });

    it("returns available domains with pricing when NAMESILO_API_KEY is set", async () => {
      process.env.NAMESILO_API_KEY = "test-ns-key";

      mockFetch.mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            request: { operation: "checkRegisterAvailability", ip: "1.2.3.4" },
            reply: {
              code: 300,
              detail: "success",
              available: [
                { domain: "prim.sh", available: "yes", price: "34.98", premium: "0" },
              ],
              unavailable: { domain: ["prim.com"] },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await searchDomains("prim", ["sh", "com"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.results).toHaveLength(2);

      const sh = result.data.results.find((r) => r.domain === "prim.sh");
      expect(sh?.available).toBe(true);
      expect(sh?.price?.register).toBe(34.98);

      const com = result.data.results.find((r) => r.domain === "prim.com");
      expect(com?.available).toBe(false);
    });

    it("uses default TLDs when tlds param is empty", async () => {
      process.env.NAMESILO_API_KEY = "test-ns-key";

      mockFetch.mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            request: { operation: "checkRegisterAvailability", ip: "1.2.3.4" },
            reply: { code: 300, detail: "success", available: [], unavailable: { domain: [] } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await searchDomains("test", []);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Default TLDs: com, net, org, io, dev, sh
      expect(result.data.results).toHaveLength(6);
    });
  });
});
