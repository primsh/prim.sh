/**
 * NameSilo API client — implements RegistrarProvider.
 *
 * NameSilo quirks:
 * - GET-only API — all operations use GET with query params
 * - API key in URL — must be redacted from any error messages / logs
 * - Base URL: https://www.namesilo.com/api/{op}?version=1&type=json&key={key}&...
 * - Rate limit: 1 req/sec/IP, max 5 concurrent connections
 * - Response envelope: { request: {...}, reply: { code, detail, ... } }
 * - Success codes: 300 = success, 301 = NS-fallback, 302 = contact-info-fallback
 */

import type {
  DomainAvailability,
  DomainPrice,
  NameserverInfo,
  RegistrarProvider,
  RegistrationResult,
} from "./registrar.ts";

const BASE_URL = "https://www.namesilo.com/api";

// ─── Credential safety ────────────────────────────────────────────────────

/**
 * Replaces the NameSilo API key in a URL string with [REDACTED].
 * Prevents key leakage into error messages, logs, and exception objects.
 */
export function redactUrl(url: string): string {
  return url.replace(/([?&]key=)[^&]+/g, "$1[REDACTED]");
}

function getApiKey(): string {
  const key = process.env.NAMESILO_API_KEY;
  if (!key) throw new NameSiloError("NAMESILO_API_KEY environment variable is required");
  return key;
}

// ─── Error class ──────────────────────────────────────────────────────────

export class NameSiloError extends Error {
  public readonly code: number | undefined;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "NameSiloError";
    this.code = code;
  }
}

// ─── Response types ───────────────────────────────────────────────────────

interface NameSiloEnvelope<T> {
  request: {
    operation: string;
    ip: string;
  };
  reply: {
    code: number;
    detail: string;
  } & T;
}

interface AvailabilityEntry {
  domain: string;
  available: string; // "yes" | "no"
  price?: string;
  "regular-price"?: string;
  premium?: string;
}

interface CheckAvailabilityReply {
  code: number;
  detail: string;
  available?: AvailabilityEntry | AvailabilityEntry[];
  unavailable?: { domain: string | string[] };
}

interface RegisterDomainReply {
  code: number;
  detail: string;
  order_amount?: string;
}

interface GetNsReply {
  code: number;
  detail: string;
  nameservers?: { nameserver: string | string[] };
}

// ─── HTTP helper ──────────────────────────────────────────────────────────

async function nsGet<T>(
  operation: string,
  params: Record<string, string>,
): Promise<NameSiloEnvelope<T>> {
  const key = getApiKey();
  const url = new URL(`${BASE_URL}/${operation}`);
  url.searchParams.set("version", "1");
  url.searchParams.set("type", "json");
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const rawUrl = url.toString();
  let res: Response;
  try {
    res = await fetch(rawUrl);
  } catch (err) {
    throw new NameSiloError(`NameSilo request failed: ${redactUrl(rawUrl)} — ${String(err)}`);
  }

  let body: NameSiloEnvelope<T>;
  try {
    body = (await res.json()) as NameSiloEnvelope<T>;
  } catch {
    throw new NameSiloError(`NameSilo returned non-JSON response for ${redactUrl(rawUrl)}`);
  }

  return body;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function isSuccess(code: number): boolean {
  return code === 300 || code === 301 || code === 302;
}

function parsePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isNaN(n) ? undefined : n;
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// ─── NameSilo client (RegistrarProvider) ─────────────────────────────────

export class NameSiloClient implements RegistrarProvider {
  async search(domains: string[]): Promise<DomainAvailability[]> {
    if (domains.length === 0) return [];

    const body = await nsGet<CheckAvailabilityReply>("checkRegisterAvailability", {
      domains: domains.join(","),
    });

    const reply = body.reply;

    // Build a set of available domains from the response
    const available = toArray(
      reply.available as unknown as AvailabilityEntry | AvailabilityEntry[],
    );
    const unavailableRaw = reply.unavailable;

    // NameSilo may return unavailable as { domain: "x" } or { domain: ["x","y"] }
    const unavailableDomains = new Set<string>(
      unavailableRaw ? toArray(unavailableRaw.domain as string | string[]) : [],
    );

    // Map available entries
    const resultMap = new Map<string, DomainAvailability>();
    for (const entry of available) {
      const registerPrice = parsePrice(entry.price ?? entry["regular-price"]);
      const price: DomainPrice | undefined =
        registerPrice !== undefined ? { register: registerPrice, currency: "USD" } : undefined;

      resultMap.set(entry.domain, {
        domain: entry.domain,
        available: true,
        price,
        premium: entry.premium === "1" || entry.premium === "yes",
      });
    }

    for (const d of unavailableDomains) {
      resultMap.set(d, { domain: d, available: false });
    }

    // Return in original request order, filling gaps for any domain not in the response
    return domains.map((d) => resultMap.get(d) ?? { domain: d, available: false });
  }

  async register(domain: string, years: number): Promise<RegistrationResult> {
    const body = await nsGet<RegisterDomainReply>("registerDomain", {
      domain,
      years: String(years),
      private: "1",
      auto_renew: "0",
    });

    if (!isSuccess(body.reply.code)) {
      throw new NameSiloError(
        `NameSilo registerDomain failed (code ${body.reply.code}): ${body.reply.detail}`,
        body.reply.code,
      );
    }

    // NameSilo doesn't return a distinct order_id in the response envelope;
    // use domain + timestamp as stable reference.
    const orderId = `ns_${domain}_${Date.now()}`;
    return { domain, orderId };
  }

  async setNameservers(domain: string, nameservers: string[]): Promise<void> {
    const nsParams: Record<string, string> = { domain };
    nameservers.forEach((ns, i) => {
      nsParams[`ns${i + 1}`] = ns;
    });

    const body = await nsGet<{ code: number; detail: string }>("changeNameServers", nsParams);

    if (!isSuccess(body.reply.code)) {
      throw new NameSiloError(
        `NameSilo changeNameServers failed (code ${body.reply.code}): ${body.reply.detail}`,
      );
    }
  }

  async getNameservers(domain: string): Promise<NameserverInfo> {
    const body = await nsGet<GetNsReply>("getDomainInfo", { domain });

    if (!isSuccess(body.reply.code)) {
      throw new NameSiloError(
        `NameSilo getDomainInfo failed (code ${body.reply.code}): ${body.reply.detail}`,
      );
    }

    const nsRaw = body.reply.nameservers?.nameserver;
    const nameservers = toArray(nsRaw as string | string[]);
    return { domain, nameservers };
  }
}

/**
 * Returns a NameSiloClient if NAMESILO_API_KEY is set, null otherwise.
 * domain.sh works in DNS-only mode without the API key.
 */
export function getRegistrar(): NameSiloClient | null {
  if (!process.env.NAMESILO_API_KEY) return null;
  return new NameSiloClient();
}
