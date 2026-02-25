/**
 * DNS verification helpers for domain.sh.
 * Queries live DNS (not Cloudflare API) to check propagation status.
 *
 * Uses per-request Resolver instances (not global dns.resolve*) so concurrent
 * requests don't race on setServers().
 */

import { Resolver } from "node:dns/promises";
import type { RecordRow } from "./db.ts";
import type { NsVerifyResult, RecordVerifyResult, RecordType } from "./api.ts";

const QUERY_TIMEOUT_MS = 5000;

// ─── Helpers ─────────────────────────────────────────────────────────────

function stripTrailingDot(s: string): string {
  return s.endsWith(".") ? s.slice(0, -1) : s;
}

function normalizeHostname(s: string): string {
  return stripTrailingDot(s).toLowerCase();
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    const err = Object.assign(new Error("DNS query timed out"), { code: "ETIMEOUT" });
    setTimeout(() => reject(err), ms);
  });
  return Promise.race([promise, timeout]);
}

function errorActual(err: unknown): string | null {
  const code = (err as { code?: string }).code;
  if (code === "ENOTFOUND" || code === "ENODATA") return null;
  if (code === "ETIMEOUT") return "error:timeout";
  if (code === "ECONNREFUSED") return "error:unreachable";
  return "error:dns_error";
}

// ─── NS verification ─────────────────────────────────────────────────────

export async function verifyNameservers(
  domain: string,
  expected: string[],
): Promise<NsVerifyResult> {
  const resolver = new Resolver();
  const normalizedExpected = expected.map(normalizeHostname).sort();

  try {
    const raw = await withTimeout(resolver.resolveNs(domain), QUERY_TIMEOUT_MS);
    const actual = raw.map(normalizeHostname).sort();
    const propagated =
      actual.length === normalizedExpected.length &&
      actual.every((ns, i) => ns === normalizedExpected[i]);
    return { expected: normalizedExpected, actual, propagated };
  } catch (err) {
    const actual = errorActual(err) ?? "error:dns_error";
    return { expected: normalizedExpected, actual: [actual], propagated: false };
  }
}

// ─── Record verification ─────────────────────────────────────────────────

async function resolveNsIps(nsHostnames: string[]): Promise<string[]> {
  const sysResolver = new Resolver();
  const results = await Promise.allSettled(
    nsHostnames.map((h) => withTimeout(sysResolver.resolve4(h), QUERY_TIMEOUT_MS)),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

async function resolveRecord(
  resolver: Resolver,
  row: RecordRow,
): Promise<RecordVerifyResult> {
  const type = row.type as RecordType;
  const name = row.name;
  const expected = row.content;

  try {
    switch (type) {
      case "A": {
        const addrs = await withTimeout(resolver.resolve4(name), QUERY_TIMEOUT_MS);
        const propagated = addrs.includes(expected);
        return { type, name, expected, actual: propagated ? expected : (addrs[0] ?? null), propagated };
      }
      case "AAAA": {
        const addrs = await withTimeout(resolver.resolve6(name), QUERY_TIMEOUT_MS);
        const propagated = addrs.includes(expected);
        return { type, name, expected, actual: propagated ? expected : (addrs[0] ?? null), propagated };
      }
      case "CNAME": {
        const targets = await withTimeout(resolver.resolveCname(name), QUERY_TIMEOUT_MS);
        const normalized = targets.map(normalizeHostname);
        const propagated = normalized.includes(normalizeHostname(expected));
        return { type, name, expected, actual: propagated ? expected : (normalized[0] ?? null), propagated };
      }
      case "MX": {
        const records = await withTimeout(resolver.resolveMx(name), QUERY_TIMEOUT_MS);
        const propagated = records.some(
          (r) => normalizeHostname(r.exchange) === normalizeHostname(expected) && r.priority === (row.priority ?? 10),
        );
        const first = records[0];
        const actual = first ? normalizeHostname(first.exchange) : null;
        return { type, name, expected, actual: propagated ? expected : actual, propagated };
      }
      case "TXT": {
        const chunks = await withTimeout(resolver.resolveTxt(name), QUERY_TIMEOUT_MS);
        const joined = chunks.map((c) => c.join(""));
        const propagated = joined.includes(expected);
        return { type, name, expected, actual: propagated ? expected : (joined[0] ?? null), propagated };
      }
      case "NS": {
        const servers = await withTimeout(resolver.resolveNs(name), QUERY_TIMEOUT_MS);
        const normalized = servers.map(normalizeHostname);
        const propagated = normalized.includes(normalizeHostname(expected));
        return { type, name, expected, actual: propagated ? expected : (normalized[0] ?? null), propagated };
      }
      case "SRV": {
        const records = await withTimeout(resolver.resolveSrv(name), QUERY_TIMEOUT_MS);
        // CF stores SRV content as a single string; check if any entry's name matches
        const propagated = records.some((r) => normalizeHostname(r.name) === normalizeHostname(expected));
        const first = records[0];
        return { type, name, expected, actual: propagated ? expected : (first ? normalizeHostname(first.name) : null), propagated };
      }
      case "CAA": {
        const records = await withTimeout(resolver.resolveCaa(name), QUERY_TIMEOUT_MS);
        // CF stores CAA as `0 issue "letsencrypt.org"` — check substring match
        const propagated = records.some((r) => {
          const tag = (r as unknown as Record<string, unknown>);
          const issue = tag.issue as string | undefined;
          const issuewild = tag.issuewild as string | undefined;
          const iodef = tag.iodef as string | undefined;
          const val = issue ?? issuewild ?? iodef ?? "";
          return expected.includes(val);
        });
        return { type, name, expected, actual: propagated ? expected : null, propagated };
      }
      default:
        return { type, name, expected, actual: "error:dns_error", propagated: false };
    }
  } catch (err) {
    return { type, name, expected, actual: errorActual(err), propagated: false };
  }
}

export async function verifyRecords(
  records: RecordRow[],
  expectedNsHostnames: string[],
): Promise<RecordVerifyResult[]> {
  if (records.length === 0) return [];

  const nsIps = await resolveNsIps(expectedNsHostnames);

  if (nsIps.length === 0) {
    return records.map((row) => ({
      type: row.type as RecordType,
      name: row.name,
      expected: row.content,
      actual: "error:ns_unresolvable",
      propagated: false,
    }));
  }

  const authResolver = new Resolver();
  authResolver.setServers(nsIps);

  const results = await Promise.allSettled(
    records.map((row) => resolveRecord(authResolver, row)),
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      type: records[i].type as RecordType,
      name: records[i].name,
      expected: records[i].content,
      actual: "error:dns_error",
      propagated: false,
    };
  });
}
