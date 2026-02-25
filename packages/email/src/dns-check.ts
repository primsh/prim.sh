/**
 * DNS verification for custom domains (R-9).
 * Uses Node.js dns.promises — works with any DNS provider.
 */

import { promises as dns } from "node:dns";

export interface DnsCheckResult {
  pass: boolean;
  expected: string;
  found: string | null;
}

const MAIL_HOST = process.env.EMAIL_MAIL_HOST ?? "mail.email.prim.sh";

export async function checkMx(domain: string): Promise<DnsCheckResult> {
  const expected = MAIL_HOST;
  try {
    const records = await dns.resolveMx(domain);
    const match = records.find(
      (r) => r.exchange.toLowerCase() === expected.toLowerCase(),
    );
    return {
      pass: !!match,
      expected,
      found: match ? match.exchange : (records[0]?.exchange ?? null),
    };
  } catch {
    return { pass: false, expected, found: null };
  }
}

export async function checkSpf(domain: string): Promise<DnsCheckResult> {
  const expected = `include:${domain.includes("email.prim.sh") ? domain : "email.prim.sh"}`;
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map((r) => r.join(""));
    const spf = flat.find((r) => r.startsWith("v=spf1"));
    if (!spf) return { pass: false, expected, found: null };
    const pass = spf.includes("include:email.prim.sh") || spf.includes(`a:${MAIL_HOST}`);
    return { pass, expected: "include:email.prim.sh", found: spf };
  } catch {
    return { pass: false, expected: "include:email.prim.sh", found: null };
  }
}

export async function checkDmarc(domain: string): Promise<DnsCheckResult> {
  const expected = "v=DMARC1";
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    const flat = records.map((r) => r.join(""));
    const dmarc = flat.find((r) => r.startsWith("v=DMARC1"));
    return {
      pass: !!dmarc,
      expected,
      found: dmarc ?? null,
    };
  } catch {
    return { pass: false, expected, found: null };
  }
}

export async function verifyDns(
  domain: string,
): Promise<{ allPass: boolean; mx: DnsCheckResult; spf: DnsCheckResult; dmarc: DnsCheckResult }> {
  const [mx, spf, dmarc] = await Promise.all([
    checkMx(domain),
    checkSpf(domain),
    checkDmarc(domain),
  ]);
  return {
    allPass: mx.pass && spf.pass && dmarc.pass,
    mx,
    spf,
    dmarc,
  };
}
