/**
 * D-9: Live smoke test for domain.sh — Cloudflare DNS + NameSilo search.
 * Tests Cloudflare API and (optionally) NameSilo search directly.
 *
 * Run:
 *   CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=xxx pnpm -C packages/domain test:smoke
 *   Add NAMESILO_API_KEY=xxx to also test domain search.
 *
 * Skips gracefully when CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID are not set.
 */

import { afterAll, describe, expect, it } from "vitest";
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
const testDomain = `prim-smoke-${testTag}.io`;

// ─── Shared state ──────────────────────────────────────────────────────

let cfZoneId: string | null = null;
let record1Id: string | null = null;
let batchRecordId: string | null = null;

// ─── Cleanup ───────────────────────────────────────────────────────────

afterAll(async () => {
  if (cfZoneId) {
    try {
      await deleteZone(cfZoneId);
    } catch {
      // Already deleted or never fully created
    }
  }
});

// ─── Cloudflare tests ──────────────────────────────────────────────────

describe.skipIf(!HAS_CF)("domain.sh Cloudflare live smoke test", { timeout: 60_000 }, () => {
  it("0. preflight — env vars present", () => {
    requireEnv("CLOUDFLARE_API_TOKEN");
    requireEnv("CLOUDFLARE_ACCOUNT_ID");
  });

  it("1. create zone", async () => {
    const zone = await createZone(testDomain);

    expect(zone.id).toBeTruthy();
    expect(zone.name).toBe(testDomain);
    expect(Array.isArray(zone.name_servers)).toBe(true);
    cfZoneId = zone.id;
  });

  it("2. get zone — verify fields", async () => {
    const zone = await getZone(cfZoneId!);

    expect(zone.id).toBe(cfZoneId);
    expect(zone.name).toBe(testDomain);
    expect(["pending", "active"]).toContain(zone.status);
  });

  it("3. create TXT record", async () => {
    const record = await createDnsRecord(cfZoneId!, {
      type: "TXT",
      name: `_smoke.${testDomain}`,
      content: "v=prim-smoke-test",
      ttl: 300,
    });

    expect(record.id).toBeTruthy();
    expect(record.type).toBe("TXT");
    expect(record.content).toBe("v=prim-smoke-test");
    record1Id = record.id;
  });

  it("4. get record — verify", async () => {
    const record = await getDnsRecord(cfZoneId!, record1Id!);

    expect(record.id).toBe(record1Id);
    expect(record.type).toBe("TXT");
    expect(record.content).toBe("v=prim-smoke-test");
  });

  it("5. list records — test record appears", async () => {
    const records = await listDnsRecords(cfZoneId!);
    const found = records.find((r) => r.id === record1Id);

    expect(found).toBeDefined();
    expect(found?.content).toBe("v=prim-smoke-test");
  });

  it("6. update record", async () => {
    const updated = await updateDnsRecord(cfZoneId!, record1Id!, {
      type: "TXT",
      name: `_smoke.${testDomain}`,
      content: "v=prim-smoke-test-updated",
      ttl: 600,
    });

    expect(updated.id).toBe(record1Id);
    expect(updated.content).toBe("v=prim-smoke-test-updated");
    expect(updated.ttl).toBe(600);
  });

  it("7. batch DNS — create A record + delete TXT record", async () => {
    const result = await batchDnsRecords(cfZoneId!, {
      posts: [
        {
          type: "A",
          name: `smoke-a.${testDomain}`,
          content: "192.0.2.1",
          ttl: 300,
        },
      ],
      deletes: [{ id: record1Id! }],
    });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].type).toBe("A");
    expect(result.posts[0].content).toBe("192.0.2.1");
    expect(result.deletes).toHaveLength(1);
    batchRecordId = result.posts[0].id;
    record1Id = null; // Deleted
  });

  it("8. delete A record", async () => {
    const deletedId = batchRecordId!;
    await deleteDnsRecord(cfZoneId!, deletedId);
    batchRecordId = null;

    const records = await listDnsRecords(cfZoneId!);
    const found = records.find((r) => r.id === deletedId);
    expect(found).toBeUndefined();
  });

  it("9. delete zone", async () => {
    await deleteZone(cfZoneId!);
    cfZoneId = null; // Prevent afterAll double-delete
  });
});

// ─── NameSilo tests ────────────────────────────────────────────────────

describe.skipIf(!HAS_NAMESILO)("domain.sh NameSilo live smoke test", { timeout: 30_000 }, () => {
  it("0. domain search — availability check", async () => {
    const registrar = getRegistrar();
    expect(registrar).toBeDefined();

    const query = `smoke-${testTag}-test`;
    const results = await registrar!.search([`${query}.com`, `${query}.io`, `${query}.dev`]);

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.domain).toBeTruthy();
      expect(typeof result.available).toBe("boolean");
    }
  });
});
