/**
 * D-1 dns.sh tests: zone + record CRUD with ownership enforcement.
 *
 * Tests the service layer directly (same pattern as spawn.sh).
 * x402 middleware is tested separately in @agentstack/x402-middleware.
 *
 * IMPORTANT: env vars must be set before any module import that touches db/cloudflare.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Set env before imports
process.env.DNS_DB_PATH = ":memory:";
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

// Mock fetch: intercepts Cloudflare API calls
const mockFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : (input as URL).toString();
  const method = _init?.method ?? "GET";

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
} from "../src/service.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────

const CALLER = "0xCa11e900000000000000000000000000000000001";
const OTHER = "0xCa11e900000000000000000000000000000000002";

// ─── Tests ───────────────────────────────────────────────────────────────

describe("dns.sh", () => {
  beforeEach(() => {
    resetDb();
    mockFetch.mockClear();
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
});
