/**
 * D-9: Live smoke test for domain.sh — Cloudflare DNS + service layer + NameSilo search.
 *
 * Phase 1 (tests 0–9):  Cloudflare API layer directly (cloudflare.ts)
 * Phase 2 (tests 10–15): Service layer (service.ts + in-memory SQLite + real CF)
 * Phase 3 (optional):   NameSilo domain search
 *
 * Run:
 *   CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=xxx pnpm -C packages/domain test:smoke
 *   Add NAMESILO_API_KEY=xxx to also test domain search.
 *
 * Skips gracefully when CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID are not set.
 *
 * Uses .example (RFC 2606 reserved) — CF accepts the zone (stays pending),
 * avoids real-TLD zone-creation rate limits, and is unambiguous about intent.
 */

// Set DB to in-memory before any call to getDb()
process.env.DOMAIN_DB_PATH = ":memory:";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  batchDnsRecords,
  createDnsRecord,
  createZone,
  deleteDnsRecord,
  deleteZone,
  getDnsRecord,
  getZone,
  listDnsRecords,
  updateDnsRecord,
} from "../src/cloudflare.ts";
import * as service from "../src/service.ts";
import { getZoneById, resetDb } from "../src/db.ts";
import { getRegistrar } from "../src/namesilo.ts";
import { randomBytes } from "node:crypto";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const HAS_CF = !!process.env.CLOUDFLARE_API_TOKEN && !!process.env.CLOUDFLARE_ACCOUNT_ID;
const HAS_NAMESILO = !!process.env.NAMESILO_API_KEY;

const testTag = randomBytes(4).toString("hex");

// ─── Phase 1: Cloudflare API layer directly ───────────────────────────────

const p1Domain = `smoke-${testTag}.example`;

let p1ZoneId: string | null = null;
let p1TxtRecordId: string | null = null;
let p1MxRecordId: string | null = null;
let p1BatchRecordId: string | null = null;

describe.skipIf(!HAS_CF)("domain.sh Cloudflare live smoke test", { timeout: 60_000 }, () => {
  afterAll(async () => {
    if (p1ZoneId) {
      try {
        await deleteZone(p1ZoneId);
      } catch {
        // Already deleted or never fully created
      }
    }
  });

  it("0. preflight — env vars present", () => {
    requireEnv("CLOUDFLARE_API_TOKEN");
    requireEnv("CLOUDFLARE_ACCOUNT_ID");
  });

  it("1. create zone", async () => {
    const zone = await createZone(p1Domain);

    expect(zone.id).toBeTruthy();
    expect(zone.name).toBe(p1Domain);
    expect(Array.isArray(zone.name_servers)).toBe(true);
    p1ZoneId = zone.id;
  });

  it("2. get zone — verify fields", async () => {
    const zone = await getZone(p1ZoneId!);

    expect(zone.id).toBe(p1ZoneId);
    expect(zone.name).toBe(p1Domain);
    expect(["pending", "active"]).toContain(zone.status);
  });

  it("3. create TXT record", async () => {
    const record = await createDnsRecord(p1ZoneId!, {
      type: "TXT",
      name: `_smoke.${p1Domain}`,
      content: "v=prim-smoke-test",
      ttl: 300,
    });

    expect(record.id).toBeTruthy();
    expect(record.type).toBe("TXT");
    expect(record.content).toBe("v=prim-smoke-test");
    p1TxtRecordId = record.id;
  });

  it("4. create MX record — assert priority field", async () => {
    const record = await createDnsRecord(p1ZoneId!, {
      type: "MX",
      name: p1Domain,
      content: `mail.${p1Domain}`,
      ttl: 3600,
      priority: 10,
    });

    expect(record.id).toBeTruthy();
    expect(record.type).toBe("MX");
    expect(record.priority).toBe(10);
    p1MxRecordId = record.id;
  });

  it("5. list records — both records appear", async () => {
    const records = await listDnsRecords(p1ZoneId!);

    expect(records.length).toBeGreaterThanOrEqual(2);
    const txt = records.find((r) => r.id === p1TxtRecordId);
    const mx = records.find((r) => r.id === p1MxRecordId);
    expect(txt).toBeDefined();
    expect(mx).toBeDefined();
    expect(mx?.priority).toBe(10);
  });

  it("6. get TXT record — verify", async () => {
    const record = await getDnsRecord(p1ZoneId!, p1TxtRecordId!);

    expect(record.id).toBe(p1TxtRecordId);
    expect(record.type).toBe("TXT");
    expect(record.content).toBe("v=prim-smoke-test");
  });

  it("7. update TXT record", async () => {
    const updated = await updateDnsRecord(p1ZoneId!, p1TxtRecordId!, {
      type: "TXT",
      name: `_smoke.${p1Domain}`,
      content: "v=prim-smoke-test-updated",
      ttl: 600,
    });

    expect(updated.id).toBe(p1TxtRecordId);
    expect(updated.content).toBe("v=prim-smoke-test-updated");
    expect(updated.ttl).toBe(600);
  });

  it("8. batch DNS — create A record + delete TXT record", async () => {
    const result = await batchDnsRecords(p1ZoneId!, {
      posts: [
        {
          type: "A",
          name: `smoke-a.${p1Domain}`,
          content: "192.0.2.1",
          ttl: 300,
        },
      ],
      deletes: [{ id: p1TxtRecordId! }],
    });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].type).toBe("A");
    expect(result.posts[0].content).toBe("192.0.2.1");
    expect(result.deletes).toHaveLength(1);
    p1BatchRecordId = result.posts[0].id;
    p1TxtRecordId = null; // Deleted
  });

  it("9. delete A record + MX record", async () => {
    const aId = p1BatchRecordId!;
    const mxId = p1MxRecordId!;
    await deleteDnsRecord(p1ZoneId!, aId);
    await deleteDnsRecord(p1ZoneId!, mxId);
    p1BatchRecordId = null;
    p1MxRecordId = null;
  });

  it("10. delete zone", async () => {
    await deleteZone(p1ZoneId!);
    p1ZoneId = null; // Prevent afterAll double-delete
  });
});

// ─── Phase 2: Service layer (service.ts + in-memory SQLite + real CF) ────────

const p2Domain = `svc-smoke-${testTag}.example`;
const callerWallet = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

let p2ZoneId: string | null = null; // prim zone ID (z_xxxx)
let p2CfZoneId: string | null = null; // CF zone ID (for afterAll fallback cleanup)
let p2RecordId: string | null = null; // prim record ID (r_xxxx)

describe.skipIf(!HAS_CF)("domain.sh service layer live smoke test", { timeout: 90_000 }, () => {
  beforeAll(() => {
    resetDb();
  });

  afterAll(async () => {
    if (p2ZoneId) {
      // service.deleteZone cleans up both CF + SQLite
      try {
        await service.deleteZone(p2ZoneId, callerWallet);
      } catch {
        // Fallback: delete CF zone directly if service delete failed
        if (p2CfZoneId) {
          try {
            await deleteZone(p2CfZoneId);
          } catch {
            // Already gone
          }
        }
      }
    }
  });

  it("10. createZone via service — zone in CF + SQLite", async () => {
    const result = await service.createZone({ domain: p2Domain }, callerWallet);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const zone = result.data.zone;
    expect(zone.id).toBeTruthy();
    expect(zone.domain).toBe(p2Domain);
    expect(zone.owner_wallet).toBe(callerWallet);
    expect(zone.name_servers.length).toBeGreaterThan(0);

    p2ZoneId = zone.id;

    // Cache CF zone ID for afterAll fallback
    const row = getZoneById(p2ZoneId);
    p2CfZoneId = row?.cloudflare_id ?? null;
  });

  it("11. createRecord (MX, priority 10) — in CF + SQLite", async () => {
    const result = await service.createRecord(
      p2ZoneId!,
      {
        type: "MX",
        name: p2Domain,
        content: `mail.${p2Domain}`,
        ttl: 3600,
        priority: 10,
      },
      callerWallet,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.type).toBe("MX");
    expect(result.data.priority).toBe(10);
    expect(result.data.zone_id).toBe(p2ZoneId);
    p2RecordId = result.data.id;
  });

  it("12. mailSetup — creates A + MX + SPF + DMARC records", async () => {
    const result = await service.mailSetup(
      p2ZoneId!,
      {
        mail_server: `mail.${p2Domain}`,
        mail_server_ip: "192.0.2.10",
      },
      callerWallet,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.records.length).toBeGreaterThanOrEqual(4);
    const names = result.data.records.map((r) => r.name);
    const types = result.data.records.map((r) => r.type);
    expect(types).toContain("A");
    expect(types).toContain("MX");
    // Both SPF (domain TXT) and DMARC (_dmarc. prefix) must be created
    expect(types.filter((t) => t === "TXT").length).toBeGreaterThanOrEqual(2);
    expect(names.some((n) => n.startsWith("_dmarc."))).toBe(true);
  });

  it("13. batchRecords — create AAAA + delete MX from test 11", async () => {
    const result = await service.batchRecords(
      p2ZoneId!,
      {
        create: [
          { type: "AAAA", name: `ipv6.${p2Domain}`, content: "2001:db8::1", ttl: 300 },
        ],
        delete: [{ id: p2RecordId! }],
      },
      callerWallet,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.created).toHaveLength(1);
    expect(result.data.created[0].type).toBe("AAAA");
    expect(result.data.deleted).toHaveLength(1);
    expect(result.data.deleted[0].id).toBe(p2RecordId);
    p2RecordId = null; // Deleted
  });

  it("14. verifyZone — returns result (propagated=false expected for .example)", async () => {
    const result = await service.verifyZone(p2ZoneId!, callerWallet);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.domain).toBe(p2Domain);
    // .example is not a real domain — NS won't propagate, but the call must succeed
    expect(typeof result.data.all_propagated).toBe("boolean");
    expect(result.data.nameservers.expected.length).toBeGreaterThan(0);
  });

  it("15. deleteZone via service — removes CF zone + SQLite rows", async () => {
    const result = await service.deleteZone(p2ZoneId!, callerWallet);

    expect(result.ok).toBe(true);
    p2ZoneId = null; // Prevent afterAll double-delete
    p2CfZoneId = null;
  });
});

// ─── Phase 3: NameSilo domain search ─────────────────────────────────────────

describe.skipIf(!HAS_NAMESILO)("domain.sh NameSilo live smoke test", { timeout: 30_000 }, () => {
  it("0. domain search — known-available + known-unavailable", async () => {
    const registrar = getRegistrar();
    expect(registrar).toBeDefined();

    // "github" is universally taken; a random smoke tag is almost certainly available.
    const randomQuery = `smoke-${testTag}-notreal`;
    const results = await registrar!.search([
      "github.com",
      "github.net",
      "github.xyz",
      `${randomQuery}.com`,
    ]);

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.domain).toBeTruthy();
      expect(typeof result.available).toBe("boolean");
    }

    // github.com must be taken
    const githubCom = results.find((r) => r.domain === "github.com");
    expect(githubCom).toBeDefined();
    expect(githubCom?.available).toBe(false);
  });
});
