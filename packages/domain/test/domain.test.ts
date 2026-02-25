/**
 * D-1/D-2 domain.sh tests: zone + record CRUD with ownership enforcement, domain search.
 *
 * Tests the service layer directly (same pattern as spawn.sh).
 * x402 middleware is tested separately in @primsh/x402-middleware.
 *
 * IMPORTANT: env vars must be set before any module import that touches db/cloudflare.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

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

  // CF: GET /zones/:id — get zone (for status refresh)
  if (url.match(/\/client\/v4\/zones\/[^/]+$/) && method === "GET") {
    return new Response(
      JSON.stringify({ success: true, errors: [], result: makeCfZone() }),
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

  // CF: PUT /zones/:id/activation_check — trigger activation check
  if (url.match(/\/client\/v4\/zones\/[^/]+\/activation_check$/) && method === "PUT") {
    return new Response(
      JSON.stringify({ success: true, errors: [], result: makeCfZone({ status: "active" }) }),
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

  // NameSilo: checkRegisterAvailability — default: available at $9.95
  if (url.includes("namesilo.com") && url.includes("checkRegisterAvailability")) {
    const urlObj = new URL(url);
    const domains = urlObj.searchParams.get("domains")?.split(",") ?? [];
    return new Response(
      JSON.stringify({
        request: { operation: "checkRegisterAvailability", ip: "1.2.3.4" },
        reply: {
          code: 300,
          detail: "success",
          available: domains.map((d) => ({ domain: d, available: "yes", price: "9.95", premium: "0" })),
          unavailable: { domain: [] },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // NameSilo: registerDomain — default: success
  if (url.includes("namesilo.com") && url.includes("registerDomain")) {
    return new Response(
      JSON.stringify({
        request: { operation: "registerDomain", ip: "1.2.3.4" },
        reply: { code: 300, detail: "success", order_amount: "9.95" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // NameSilo: changeNameServers — default: success
  if (url.includes("namesilo.com") && url.includes("changeNameServers")) {
    return new Response(
      JSON.stringify({
        request: { operation: "changeNameServers", ip: "1.2.3.4" },
        reply: { code: 300, detail: "success" },
      }),
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
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  resolveCname: vi.fn(),
  resolveMx: vi.fn(),
  resolveTxt: vi.fn(),
  resolveNs: vi.fn(),
  resolveSrv: vi.fn(),
  resolveCaa: vi.fn(),
  setServers: vi.fn(),
};

vi.mock("node:dns/promises", () => ({
  Resolver: vi.fn(() => dnsResolverMock),
}));

// Import after env + fetch stub
import { resetDb, getZoneById, getRecordById, getRecordsByZone, getRegistrationByDomain, insertZone, insertRegistration, insertQuote } from "../src/db.ts";
import {
  createZone,
  listZones,
  getZone,
  deleteZone,
  refreshZoneStatus,
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
  searchDomains,
  batchRecords,
  mailSetup,
  verifyZone,
  quoteDomain,
  registerDomain,
  recoverRegistration,
  configureNs,
  getRegistrationStatus,
  activateZone,
  usdToCents,
  centsToAtomicUsdc,
  centsToUsd,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.values(dnsResolverMock).forEach((m) => (m as any).mockReset());
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

      const result = await getZone(created.data.zone.id, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.domain).toBe("example.com");
    });

    it("get zone — non-owner gets 403", async () => {
      const created = await createZone({ domain: "example.com" }, CALLER);
      if (!created.ok) return;

      const result = await getZone(created.data.zone.id, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("get zone — nonexistent returns 404", async () => {
      const result = await getZone("z_nonexist", CALLER);
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

  // ─── Monetary conversions ─────────────────────────────────────────────

  describe("monetary conversions", () => {
    it("usdToCents(34.98) === 3498", () => { expect(usdToCents(34.98)).toBe(3498); });
    it("usdToCents(0.99) === 99", () => { expect(usdToCents(0.99)).toBe(99); });
    it("centsToAtomicUsdc(3498) === '34980000'", () => { expect(centsToAtomicUsdc(3498)).toBe("34980000"); });
    it("centsToAtomicUsdc(99) === '990000'", () => { expect(centsToAtomicUsdc(99)).toBe("990000"); });
    it("centsToUsd(3498) === 34.98", () => { expect(centsToUsd(3498)).toBe(34.98); });
  });

  // ─── NameSiloError code field ─────────────────────────────────────────

  describe("NameSiloError", () => {
    it("carries code when provided", async () => {
      const { NameSiloError } = await import("../src/namesilo.ts");
      const err = new NameSiloError("msg", 261);
      expect(err.code).toBe(261);
    });

    it("code is undefined when omitted", async () => {
      const { NameSiloError } = await import("../src/namesilo.ts");
      const err = new NameSiloError("msg");
      expect(err.code).toBeUndefined();
    });
  });

  // ─── Quote domain ─────────────────────────────────────────────────────

  describe("quote domain", () => {
    beforeEach(() => {
      process.env.NAMESILO_API_KEY = "test-ns-key";
    });

    afterEach(() => {
      process.env.NAMESILO_API_KEY = "";
    });

    it("returns quote_id with q_ prefix and pricing", async () => {
      const result = await quoteDomain({ domain: "example.com" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.quote_id).toMatch(/^q_/);
      expect(result.data.domain).toBe("example.com");
      expect(result.data.available).toBe(true);
      expect(result.data.total_cost_usd).toBeGreaterThan(result.data.registrar_cost_usd);
      expect(result.data.currency).toBe("USD");
      // expires_at is ~15 min from now
      const exp = new Date(result.data.expires_at).getTime();
      expect(exp - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    });

    it("applies margin: total > registrar_cost", async () => {
      const result = await quoteDomain({ domain: "example.com" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.total_cost_usd).toBeGreaterThan(result.data.registrar_cost_usd);
    });

    it("returns 503 when NAMESILO_API_KEY is not set", async () => {
      process.env.NAMESILO_API_KEY = "";
      const result = await quoteDomain({ domain: "example.com" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(503);
    });

    it("returns 400 for invalid domain", async () => {
      const result = await quoteDomain({ domain: "not-a-domain" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("returns 400 for unavailable domain", async () => {
      // Mock NameSilo returning domain as unavailable
      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({
            request: { operation: "checkRegisterAvailability", ip: "1.2.3.4" },
            reply: {
              code: 300,
              detail: "success",
              available: [],
              unavailable: { domain: ["taken.com"] },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      const result = await quoteDomain({ domain: "taken.com" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("domain_taken");
    });
  });

  // ─── Register domain ──────────────────────────────────────────────────

  describe("register domain", () => {
    let quoteId: string;

    beforeEach(async () => {
      process.env.NAMESILO_API_KEY = "test-ns-key";
      const q = await quoteDomain({ domain: "example.com" }, CALLER);
      if (!q.ok) throw new Error("Failed to create quote");
      quoteId = q.data.quote_id;
    });

    afterEach(() => {
      process.env.NAMESILO_API_KEY = "";
    });

    it("full success: registered=true, zone_id set, ns_configured=true, recovery_token=null", async () => {
      const result = await registerDomain(quoteId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.registered).toBe(true);
      expect(result.data.zone_id).toMatch(/^z_/);
      expect(result.data.ns_configured).toBe(true);
      expect(result.data.recovery_token).toBeNull();
      expect(result.data.nameservers).toHaveLength(2);
    });

    it("persists registration row to DB", async () => {
      await registerDomain(quoteId, CALLER);
      const reg = getRegistrationByDomain("example.com");
      expect(reg).not.toBeNull();
      expect(reg?.namesilo_order_id).toBeTruthy();
      expect(reg?.owner_wallet).toBe(CALLER);
    });

    it("returns 404 for unknown quote_id", async () => {
      const result = await registerDomain("q_nonexistent", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("returns 410 for expired quote", async () => {
      // Manually expire the quote by creating one with expired timestamp
      const { insertQuote } = await import("../src/db.ts");
      insertQuote({
        id: "q_expired",
        domain: "expired.com",
        years: 1,
        registrar_cost_cents: 995,
        margin_cents: 100,
        total_cents: 1095,
        caller_wallet: CALLER,
        expires_at: Date.now() - 1000, // expired 1 second ago
      });
      const result = await registerDomain("q_expired", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(410);
      expect(result.code).toBe("quote_expired");
    });

    it("returns 400 (domain_taken) when NameSilo returns code 261", async () => {
      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({
            request: { operation: "registerDomain", ip: "1.2.3.4" },
            reply: { code: 261, detail: "Domain not available for registration" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      const result = await registerDomain(quoteId, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("domain_taken");
    });

    it("partial: CF fails after NameSilo success → 201 with recovery_token", async () => {
      // NameSilo register succeeds (default mock), CF zone creation fails
      mockFetch.mockImplementationOnce(async () =>
        // NameSilo register — success
        new Response(
          JSON.stringify({ request: { operation: "registerDomain", ip: "1.2.3.4" }, reply: { code: 300, detail: "success" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ).mockImplementationOnce(async () =>
        // CF POST /zones — error
        new Response(
          JSON.stringify({ success: false, errors: [{ code: 1000, message: "CF error" }] }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );
      const result = await registerDomain(quoteId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.zone_id).toBeNull();
      expect(result.data.recovery_token).toMatch(/^rt_/);
      expect(result.data.ns_configured).toBe(false);
    });

    it("partial: NS fails after CF success → 201, ns_configured=false, recovery_token=null", async () => {
      // NameSilo register succeeds, CF zone creation succeeds (defaults), NS change fails
      mockFetch
        .mockImplementationOnce(async (input: RequestInfo | URL) => {
          // NameSilo registerDomain
          const u = typeof input === "string" ? input : (input as URL).toString();
          if (u.includes("namesilo") && u.includes("registerDomain")) {
            return new Response(
              JSON.stringify({ request: { operation: "registerDomain", ip: "1.2.3.4" }, reply: { code: 300, detail: "success" } }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(JSON.stringify({ success: true, errors: [], result: { id: "cf-zone-001", name: "example.com", status: "pending", name_servers: ["ns1.cloudflare.com", "ns2.cloudflare.com"] } }), { status: 200, headers: { "Content-Type": "application/json" } });
        })
        .mockImplementationOnce(async () =>
          // CF POST /zones — success
          new Response(
            JSON.stringify({ success: true, errors: [], result: { id: "cf-zone-001", name: "example.com", status: "pending", name_servers: ["ns1.cloudflare.com", "ns2.cloudflare.com"] } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockImplementationOnce(async () =>
          // NameSilo changeNameServers — fails
          new Response(
            JSON.stringify({ request: { operation: "changeNameServers", ip: "1.2.3.4" }, reply: { code: 999, detail: "NS error" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      const result = await registerDomain(quoteId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.zone_id).toMatch(/^z_/);
      expect(result.data.ns_configured).toBe(false);
      expect(result.data.recovery_token).toBeNull();
    });
  });

  // ─── Recover registration ─────────────────────────────────────────────

  describe("recover registration", () => {
    let recoveryToken: string;

    beforeEach(async () => {
      process.env.NAMESILO_API_KEY = "test-ns-key";
      // Create a quote
      const q = await quoteDomain({ domain: "example.com" }, CALLER);
      if (!q.ok) throw new Error("Failed to create quote");
      // Simulate NameSilo success + CF failure → leaves recovery_token
      const { NameSiloError } = await import("../src/namesilo.ts");
      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ request: { operation: "registerDomain", ip: "1.2.3.4" }, reply: { code: 300, detail: "success" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ).mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ success: false, errors: [{ code: 1000, message: "CF down" }] }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );
      const reg = await registerDomain(q.data.quote_id, CALLER);
      if (!reg.ok) throw new Error("Failed to register");
      recoveryToken = reg.data.recovery_token!;
    });

    afterEach(() => {
      process.env.NAMESILO_API_KEY = "";
    });

    it("successful recovery creates zone and sets ns_configured", async () => {
      const result = await recoverRegistration(recoveryToken, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.zone_id).toMatch(/^z_/);
      expect(result.data.nameservers).toHaveLength(2);
    });

    it("clears recovery_token after success", async () => {
      await recoverRegistration(recoveryToken, CALLER);
      const reg = getRegistrationByDomain("example.com");
      expect(reg?.recovery_token).toBeNull();
    });

    it("returns 404 for invalid token", async () => {
      const result = await recoverRegistration("rt_nonexistent", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("returns 403 for wrong wallet", async () => {
      const result = await recoverRegistration(recoveryToken, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });
  });

  // ─── Configure NS ─────────────────────────────────────────────────────

  describe("configure NS", () => {
    beforeEach(async () => {
      process.env.NAMESILO_API_KEY = "test-ns-key";
      // Fully register (NameSilo + CF ok, NS fails) to get a zone with ns_configured=false
      const q = await quoteDomain({ domain: "example.com" }, CALLER);
      if (!q.ok) throw new Error("Failed to create quote");
      // Intercept the NS change to fail
      const origMockImpl = mockFetch.getMockImplementation();
      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ request: { operation: "registerDomain", ip: "1.2.3.4" }, reply: { code: 300, detail: "success" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ).mockImplementationOnce(async () =>
        // CF zone — success
        new Response(
          JSON.stringify({ success: true, errors: [], result: makeCfZone({ name: "example.com" }) }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ).mockImplementationOnce(async () =>
        // NS change — fail
        new Response(
          JSON.stringify({ request: { operation: "changeNameServers", ip: "1.2.3.4" }, reply: { code: 999, detail: "NS error" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      await registerDomain(q.data.quote_id, CALLER);
    });

    afterEach(() => {
      process.env.NAMESILO_API_KEY = "";
    });

    it("successfully configures NS and sets ns_configured=true", async () => {
      const result = await configureNs("example.com", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.ns_configured).toBe(true);
      expect(result.data.nameservers).toBeDefined();
    });

    it("persists ns_configured=true to DB", async () => {
      await configureNs("example.com", CALLER);
      const reg = getRegistrationByDomain("example.com");
      expect(reg?.ns_configured).toBe(1);
    });

    it("returns 403 for wrong wallet", async () => {
      const result = await configureNs("example.com", OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("returns 404 for unregistered domain", async () => {
      const result = await configureNs("notregistered.com", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });
  });

  // ─── Zone status refresh ──────────────────────────────────────────────────

  describe("zone status refresh (getZone auto-refresh)", () => {
    it("pending zone: CF returns active → getZone returns active, DB updated", async () => {
      const created = await createZone({ domain: "example.com" }, CALLER);
      if (!created.ok) throw new Error("setup failed");
      const zoneId = created.data.zone.id;

      // Mock CF GET /zones/:id to return "active"
      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ success: true, errors: [], result: makeCfZone({ status: "active" }) }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await getZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("active");

      // DB updated
      const row = getZoneById(zoneId);
      expect(row?.status).toBe("active");
    });

    it("active zone: CF is NOT called", async () => {
      // Insert a zone directly with status "active"
      const zoneId = "z_active_test";
      insertZone({
        id: zoneId,
        cloudflare_id: "cf-zone-active",
        domain: "active.com",
        owner_wallet: CALLER,
        status: "active",
        nameservers: ["ns1.cloudflare.com", "ns2.cloudflare.com"],
      });

      const callsBefore = mockFetch.mock.calls.length;
      const result = await getZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("active");

      // No new CF calls made (no GET /zones/:id)
      const cfGetCalls = mockFetch.mock.calls
        .slice(callsBefore)
        .filter(([_url, init]) => {
          const u = typeof _url === "string" ? _url : (_url as URL).toString();
          return u.match(/\/client\/v4\/zones\/[^/]+$/) && (!init?.method || init.method === "GET");
        });
      expect(cfGetCalls).toHaveLength(0);
    });

    it("refreshZoneStatus: pending → active updates DB", async () => {
      const created = await createZone({ domain: "example.com" }, CALLER);
      if (!created.ok) throw new Error("setup failed");
      const zoneId = created.data.zone.id;

      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ success: true, errors: [], result: makeCfZone({ status: "active" }) }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await refreshZoneStatus(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("active");
      expect(getZoneById(zoneId)?.status).toBe("active");
    });

    it("refreshZoneStatus: already active → no CF call, returns active", async () => {
      const zoneId = "z_refresh_active";
      insertZone({
        id: zoneId,
        cloudflare_id: "cf-zone-refresh-active",
        domain: "refreshactive.com",
        owner_wallet: CALLER,
        status: "active",
        nameservers: [],
      });

      const callsBefore = mockFetch.mock.calls.length;
      const result = await refreshZoneStatus(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("active");

      // No new fetch calls
      expect(mockFetch.mock.calls.length).toBe(callsBefore);
    });

    it("refreshZoneStatus: 404 for nonexistent zone", async () => {
      const result = await refreshZoneStatus("z_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("refreshZoneStatus: 403 for wrong wallet", async () => {
      const created = await createZone({ domain: "example.com" }, CALLER);
      if (!created.ok) throw new Error("setup failed");

      const result = await refreshZoneStatus(created.data.zone.id, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });
  });

  // ─── verifyZone with zone_status ──────────────────────────────────────────

  describe("verifyZone zone_status field", () => {
    let zoneId: string;

    beforeEach(async () => {
      const result = await createZone({ domain: "example.com" }, CALLER);
      if (!result.ok) throw new Error("setup failed");
      zoneId = result.data.zone.id;
      dnsResolverMock.resolveNs.mockResolvedValue(["ns1.cloudflare.com", "ns2.cloudflare.com"]);
      dnsResolverMock.resolve4.mockResolvedValue(["1.1.1.1"]);
    });

    it("zone_status is 'active' when CF returns active during verify", async () => {
      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ success: true, errors: [], result: makeCfZone({ status: "active" }) }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.zone_status).toBe("active");
      // DB updated
      expect(getZoneById(zoneId)?.status).toBe("active");
    });

    it("zone_status is 'pending' when CF returns pending during verify", async () => {
      // Default mock returns pending — no override needed
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.zone_status).toBe("pending");
    });

    it("all_propagated behavior unchanged (still about DNS propagation)", async () => {
      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // NS match → propagated true, no records → all_propagated true
      expect(result.data.all_propagated).toBe(true);
    });

    it("CF error during status refresh — verify still returns result with local zone_status", async () => {
      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ success: false, errors: [{ code: 1000, message: "CF down" }] }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await verifyZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Falls back to local DB status
      expect(result.data.zone_status).toBe("pending");
    });
  });

  // ─── CF activation trigger ────────────────────────────────────────────────

  describe("activate zone (PUT /v1/zones/:id/activate)", () => {
    let zoneId: string;

    beforeEach(async () => {
      const result = await createZone({ domain: "example.com" }, CALLER);
      if (!result.ok) throw new Error("setup failed");
      zoneId = result.data.zone.id;
    });

    it("returns activation_requested=true with active status when CF returns active", async () => {
      // Default mock for activation_check returns active
      const result = await activateZone(zoneId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.activation_requested).toBe(true);
      expect(result.data.status).toBe("active");
      expect(result.data.zone_id).toBe(zoneId);
    });

    it("DB status updated to active after CF returns active", async () => {
      await activateZone(zoneId, CALLER);
      expect(getZoneById(zoneId)?.status).toBe("active");
    });

    it("returns 404 for unknown zone_id", async () => {
      const result = await activateZone("z_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("returns 403 for wrong wallet", async () => {
      const result = await activateZone(zoneId, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("returns 429 when CF rate-limits the activation check", async () => {
      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ success: false, errors: [{ code: 429, message: "Rate limited" }] }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await activateZone(zoneId, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(429);
      expect(result.code).toBe("rate_limited");
    });
  });

  // ─── Registration status endpoint ─────────────────────────────────────────

  describe("getRegistrationStatus", () => {
    beforeEach(() => {
      process.env.NAMESILO_API_KEY = "test-ns-key";
      dnsResolverMock.resolveNs.mockResolvedValue(["ns1.cloudflare.com", "ns2.cloudflare.com"]);
      dnsResolverMock.resolve4.mockResolvedValue(["1.1.1.1"]);
    });

    afterEach(() => {
      process.env.NAMESILO_API_KEY = "";
    });

    // Helper: create a fully registered domain (NameSilo + CF + NS all succeed)
    async function createFullRegistration(domain: string): Promise<string> {
      const q = await quoteDomain({ domain }, CALLER);
      if (!q.ok) throw new Error("quote failed");
      const r = await registerDomain(q.data.quote_id, CALLER);
      if (!r.ok) throw new Error("register failed");
      return domain;
    }

    it("404 for unknown domain", async () => {
      const result = await getRegistrationStatus("unknown.com", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("403 for wrong wallet", async () => {
      await createFullRegistration("example.com");

      const result = await getRegistrationStatus("example.com", OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("zone_id null + next_action=recover when no zone created", async () => {
      // Insert registration without zone_id (simulate CF failure during register)
      insertQuote({
        id: "q_nozone",
        domain: "nozone.com",
        years: 1,
        registrar_cost_cents: 995,
        margin_cents: 149,
        total_cents: 1144,
        caller_wallet: CALLER,
        expires_at: Date.now() + 900000,
      });
      insertRegistration({
        id: "reg_nozone",
        domain: "nozone.com",
        quote_id: "q_nozone",
        recovery_token: "rt_nozone",
        namesilo_order_id: "ord_nozone",
        zone_id: null,
        ns_configured: false,
        owner_wallet: CALLER,
        total_cents: 1144,
      });

      const result = await getRegistrationStatus("nozone.com", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.zone_id).toBeNull();
      expect(result.data.next_action).toContain("recover");
      expect(result.data.all_ready).toBe(false);
    });

    it("ns_configured=false → next_action includes configure-ns", async () => {
      // Register with NS failing
      const q = await quoteDomain({ domain: "example.com" }, CALLER);
      if (!q.ok) throw new Error("quote failed");

      mockFetch
        .mockImplementationOnce(async () =>
          // NameSilo register — success
          new Response(
            JSON.stringify({ request: { operation: "registerDomain", ip: "1.2.3.4" }, reply: { code: 300, detail: "success" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockImplementationOnce(async () =>
          // CF zone — success
          new Response(
            JSON.stringify({ success: true, errors: [], result: makeCfZone({ name: "example.com" }) }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockImplementationOnce(async () =>
          // NS change — fail
          new Response(
            JSON.stringify({ request: { operation: "changeNameServers", ip: "1.2.3.4" }, reply: { code: 999, detail: "NS error" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      await registerDomain(q.data.quote_id, CALLER);

      // CF status refresh returns pending (default mock)
      const result = await getRegistrationStatus("example.com", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.ns_configured_at_registrar).toBe(false);
      expect(result.data.next_action).toContain("configure-ns");
    });

    it("NS set but not propagated, zone pending → next_action=wait for NS propagation", async () => {
      await createFullRegistration("example.com");
      // DNS mock: NS not yet propagated (returns wrong NS)
      dnsResolverMock.resolveNs.mockResolvedValue(["ns1.registrar.com", "ns2.registrar.com"]);
      // CF status refresh returns pending (default mock)

      const result = await getRegistrationStatus("example.com", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.ns_configured_at_registrar).toBe(true);
      expect(result.data.ns_propagated).toBe(false);
      expect(result.data.zone_status).toBe("pending");
      expect(result.data.next_action).toContain("NS propagation");
      expect(result.data.all_ready).toBe(false);
    });

    it("NS propagated, zone still pending → next_action=wait for Cloudflare activation", async () => {
      await createFullRegistration("example.com");
      // NS propagated (default mock: NS match)
      // CF status: pending (default mock returns pending)

      const result = await getRegistrationStatus("example.com", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.ns_propagated).toBe(true);
      expect(result.data.zone_status).toBe("pending");
      expect(result.data.next_action).toContain("Cloudflare activation");
      expect(result.data.all_ready).toBe(false);
    });

    it("zone active → all_ready=true, next_action=null", async () => {
      await createFullRegistration("example.com");
      // CF GET /zones/:id returns active
      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ success: true, errors: [], result: makeCfZone({ status: "active" }) }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await getRegistrationStatus("example.com", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.zone_status).toBe("active");
      expect(result.data.zone_active).toBe(true);
      expect(result.data.all_ready).toBe(true);
      expect(result.data.next_action).toBeNull();
    });

    it("zone active but NS not propagated → all_ready=true (CF authoritative)", async () => {
      await createFullRegistration("example.com");
      dnsResolverMock.resolveNs.mockResolvedValue(["ns1.registrar.com"]); // not propagated
      mockFetch.mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({ success: true, errors: [], result: makeCfZone({ status: "active" }) }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await getRegistrationStatus("example.com", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.zone_status).toBe("active");
      expect(result.data.ns_propagated).toBe(false);
      expect(result.data.all_ready).toBe(true); // CF is authoritative
      expect(result.data.next_action).toBeNull();
    });

    it("response includes ns_expected and ns_actual", async () => {
      await createFullRegistration("example.com");

      const result = await getRegistrationStatus("example.com", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.ns_expected).toHaveLength(2);
      expect(result.data.ns_actual).toBeDefined();
    });

    it("purchased=true always", async () => {
      await createFullRegistration("example.com");

      const result = await getRegistrationStatus("example.com", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.purchased).toBe(true);
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
