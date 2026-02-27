import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createAgentStackMiddleware, createWalletAllowlistChecker, createLogger, getNetworkConfig, requestIdMiddleware, forbidden, notFound, invalidRequest } from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";

const LLMS_TXT = `# domain.prim.sh — API Reference

> DNS and domain registration for AI agents. Register domains, manage Cloudflare zones, configure DNS records.

Base URL: https://domain.prim.sh
Auth: x402 payment protocol (USDC on Base)
Payment: Every non-free request returns 402 with payment requirements. Sign the payment and resend.

## Quick Start

1. GET /v1/domains/search?query=myagent&tlds=com,xyz → check availability + pricing
2. POST /v1/domains/quote {"domain": "myagent.com"} → get quote_id (valid 15 min)
3. POST /v1/domains/register {"quote_id": "..."} → register + pay quoted amount
4. POST /v1/zones {"domain": "myagent.com"} → create zone (if not auto-created)
5. POST /v1/zones/{id}/records → add DNS records

## Authentication

All paid endpoints use x402. Free endpoints: GET /, GET /llms.txt, POST /v1/domains/recover, POST /v1/domains/{domain}/configure-ns

## Endpoints

### GET /v1/domains/search — Search availability ($0.001)

Query params:
  query  string  Domain name without TLD (required, e.g. "myagent")
  tlds   string  Comma-separated TLDs to check (e.g. "com,xyz,io")

Response 200:
  results  DomainSearchResult[]
    domain     string
    available  boolean
    price      {register: number, renew?: number, currency: string} | undefined
    premium    boolean | undefined

### POST /v1/domains/quote — Get price quote ($0.001)

Request body:
  domain  string  Fully qualified domain (required)
  years   number  Registration period, default 1

Response 200:
  quote_id          string   Pass to /v1/domains/register
  domain            string
  available         true
  years             number
  registrar_cost_usd  number
  total_cost_usd    number   x402 payment amount for register
  currency          string
  expires_at        string   ISO 8601 — quote expires in 15 minutes

### POST /v1/domains/register — Register domain (dynamic pricing from quote)

Payment amount is taken from the quote's total_cost_usd, not a fixed price.

Request body:
  quote_id  string  From POST /v1/domains/quote (required)

Response 201:
  domain           string
  registered       true
  zone_id          string|null
  nameservers      string[]|null
  order_amount_usd number
  ns_configured    boolean
  recovery_token   string|null   Store this — use with /recover if setup partially fails

### POST /v1/domains/recover — Recover partial registration (free)

Request body:
  recovery_token  string  From RegisterResponse (required)

Response 200: RecoverResponse {domain, zone_id, nameservers, ns_configured}

### GET /v1/domains/{domain}/status — Registration status ($0.001)

Response 200:
  domain                    string
  purchased                 true
  zone_id                   string|null
  zone_status               "pending"|"active"|"moved"|null
  ns_configured_at_registrar  boolean
  ns_propagated             boolean
  ns_expected               string[]
  ns_actual                 string[]
  zone_active               boolean
  all_ready                 boolean   true when fully live
  next_action               string|null

### POST /v1/domains/{domain}/configure-ns — Retry NS config at registrar (free)

Response 200: ConfigureNsResponse {domain, nameservers, ns_configured}

### POST /v1/zones — Create zone ($0.05)

Request body:
  domain  string  Domain for the zone (required)

Response 201:
  zone  ZoneResponse {id, domain, status, name_servers[], owner_wallet, created_at}

### GET /v1/zones — List zones ($0.001)

Query params: limit (default 20, max 100), page (default 1)
Response 200: {zones: ZoneResponse[], meta: {page, per_page, total}}

### GET /v1/zones/{id} — Get zone ($0.001)

Response 200: ZoneResponse

### DELETE /v1/zones/{id} — Delete zone ($0.01)

Response 200: {}

### PUT /v1/zones/{zone_id}/activate — Activate zone ($0.001)

Requests Cloudflare to immediately re-check NS for activation.
Response 200: ActivateResponse {zone_id, status, activation_requested}

### GET /v1/zones/{zone_id}/verify — Verify propagation ($0.001)

Response 200:
  domain         string
  nameservers    NsVerifyResult {expected[], actual[], propagated}
  records        RecordVerifyResult[] {type, name, expected, actual, propagated}
  all_propagated boolean
  zone_status    string|null

### POST /v1/zones/{zone_id}/mail-setup — Setup mail DNS ($0.005)

Creates A, MX, SPF TXT, DMARC TXT, and optionally DKIM TXT records.

Request body:
  mail_server     string  Mail server hostname (required)
  mail_server_ip  string  Mail server IP for A record (required)
  dkim            {rsa?: {selector, public_key}, ed25519?: {selector, public_key}} (optional)

Response 200:
  records  {type, name, action: "created"|"updated"}[]

### POST /v1/zones/{zone_id}/records/batch — Batch record ops ($0.005)

Request body:
  create  BatchCreateEntry[]  {type, name, content, ttl?, proxied?, priority?}
  update  BatchUpdateEntry[]  {id, content?, ttl?, proxied?, priority?, type?, name?}
  delete  BatchDeleteEntry[]  {id}

Response 200: {created: RecordResponse[], updated: RecordResponse[], deleted: {id}[]}

### POST /v1/zones/{zone_id}/records — Create record ($0.001)

Request body:
  type     string  A|AAAA|CNAME|MX|TXT|SRV|CAA|NS (required)
  name     string  "@" for root (required)
  content  string  IP for A/AAAA, hostname for CNAME/MX, text for TXT (required)
  ttl      number  Seconds, 1=automatic (optional)
  proxied  boolean Only for A/AAAA/CNAME (optional)
  priority number  For MX/SRV (optional)

Response 201: RecordResponse

RecordResponse shape:
  id, zone_id, type, name, content, ttl, proxied, priority (number|null), created_at, updated_at

### GET /v1/zones/{zone_id}/records — List records ($0.001)

Response 200: {records: RecordResponse[]}

### GET /v1/zones/{zone_id}/records/{id} — Get record ($0.001)

Response 200: RecordResponse

### PUT /v1/zones/{zone_id}/records/{id} — Update record ($0.001)

Request body: all fields optional (type?, name?, content?, ttl?, proxied?, priority?)
Response 200: RecordResponse

### DELETE /v1/zones/{zone_id}/records/{id} — Delete record ($0.001)

Response 200: {}

## Error Format

All errors return:
  {"error": {"code": "error_code", "message": "Human-readable message"}}

Error codes: not_found, forbidden, invalid_request, cloudflare_error, rate_limited, domain_taken, quote_expired, registrar_error, registration_failed

## Ownership

All zones are scoped to the wallet address that paid to create them. Registration ownership is determined by the payer wallet from the x402 payment.
`;
import { HTTPFacilitatorClient, encodePaymentRequiredHeader, decodePaymentSignatureHeader } from "@x402/core/http";
import type {
  CreateZoneRequest,
  CreateZoneResponse,
  ZoneResponse,
  ZoneListResponse,
  CreateRecordRequest,
  UpdateRecordRequest,
  RecordResponse,
  RecordListResponse,
  DomainSearchResponse,
  BatchRecordsRequest,
  BatchRecordsResponse,
  MailSetupRequest,
  MailSetupResponse,
  VerifyResponse,
  QuoteRequest,
  QuoteResponse,
  RegisterResponse,
  RecoverRequest,
  RecoverResponse,
  ConfigureNsResponse,
  RegistrationStatusResponse,
  ActivateResponse,
} from "./api.ts";
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
  quoteDomain,
  registerDomain,
  recoverRegistration,
  configureNs,
  getRegistrationStatus,
  activateZone,
  centsToAtomicUsdc,
} from "./service.ts";
import { getQuoteById } from "./db.ts";

const logger = createLogger("domain.sh");

const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO;
if (!PAY_TO_ADDRESS) {
  throw new Error("[domain.sh] PRIM_PAY_TO environment variable is required");
}
const NETWORK = process.env.PRIM_NETWORK ?? "eip155:8453";
const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://facilitator.payai.network";
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

const DOMAIN_ROUTES = {
  "GET /v1/domains/search": "$0.001",
  "POST /v1/domains/quote": "$0.001",
  "GET /v1/domains/[domain]/status": "$0.001",
  "POST /v1/zones": "$0.05",
  "GET /v1/zones": "$0.001",
  "GET /v1/zones/[id]": "$0.001",
  "DELETE /v1/zones/[id]": "$0.01",
  "PUT /v1/zones/[zone_id]/activate": "$0.001",
  "GET /v1/zones/[zone_id]/verify": "$0.001",
  "POST /v1/zones/[zone_id]/mail-setup": "$0.005",
  "POST /v1/zones/[zone_id]/records/batch": "$0.005",
  "POST /v1/zones/[zone_id]/records": "$0.001",
  "GET /v1/zones/[zone_id]/records": "$0.001",
  "GET /v1/zones/[zone_id]/records/[id]": "$0.001",
  "PUT /v1/zones/[zone_id]/records/[id]": "$0.001",
  "DELETE /v1/zones/[zone_id]/records/[id]": "$0.001",
} as const;

function cloudflareError(message: string): ApiError {
  return { error: { code: "cloudflare_error", message } };
}

function serviceUnavailable(message: string): ApiError {
  return { error: { code: "service_unavailable", message } };
}

type AppVariables = { walletAddress: string | undefined };
const app = new Hono<{ Variables: AppVariables }>();

app.use("*", requestIdMiddleware());

app.use("*", bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: "Request too large" }, 413),
}));

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      freeRoutes: ["GET /", "GET /llms.txt", "POST /v1/domains/recover", "POST /v1/domains/[domain]/configure-ns"],
      checkAllowlist,
    },
    { ...DOMAIN_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "domain.sh", status: "ok" });
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  return c.text(LLMS_TXT);
});

// POST /v1/domains/quote — Get a time-limited price quote for domain registration
app.post("/v1/domains/quote", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: QuoteRequest;
  try {
    body = await c.req.json<QuoteRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/domains/quote", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await quoteDomain(body, caller);
  if (!result.ok) {
    if (result.status === 400) return c.json(invalidRequest(result.message), 400);
    if (result.status === 503) return c.json(serviceUnavailable(result.message), 503);
    return c.json(invalidRequest(result.message), 400);
  }
  return c.json(result.data as QuoteResponse, 200);
});

// POST /v1/domains/register — Register a domain (dynamic x402 pricing from quote)
// Bypasses x402 middleware — implements payment protocol directly.
app.post("/v1/domains/register", async (c) => {
  let body: { quote_id?: string };
  try {
    body = await c.req.json<{ quote_id?: string }>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/domains/register", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const quoteId = body.quote_id;
  if (!quoteId) return c.json(invalidRequest("quote_id is required"), 400);

  const quote = getQuoteById(quoteId);
  if (!quote) return c.json({ error: { code: "not_found", message: "Quote not found" } }, 404);
  if (quote.expires_at < Date.now()) return c.json({ error: { code: "quote_expired", message: "Quote has expired" } }, 410);

  // Build expected payment amount from quote
  const amount = centsToAtomicUsdc(quote.total_cents);
  const networkConfig = getNetworkConfig(NETWORK);

  const paymentHeader = c.req.header("payment-signature") ?? c.req.header("x-payment");

  if (!paymentHeader) {
    const paymentRequired = {
      x402Version: 2,
      accepts: [{
        scheme: "exact" as const,
        network: NETWORK,
        amount,
        payTo: PAY_TO_ADDRESS,
        asset: networkConfig.usdcAddress,
        maxTimeoutSeconds: 3600,
        extra: {},
      }],
      resource: {
        url: `${c.req.url}`,
        description: `Domain registration: ${quote.domain}`,
        mimeType: "application/json",
      },
    };
    const encoded = encodePaymentRequiredHeader(paymentRequired as Parameters<typeof encodePaymentRequiredHeader>[0]);
    return new Response(JSON.stringify({ error: { code: "payment_required", message: "Payment required" } }), {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "payment-required": encoded,
      },
    });
  }

  // Decode and verify payment amount
  let paymentPayload: ReturnType<typeof decodePaymentSignatureHeader>;
  try {
    paymentPayload = decodePaymentSignatureHeader(paymentHeader);
  } catch (err) {
    logger.warn("payment header decode failed", { error: String(err) });
    return c.json(invalidRequest("Invalid payment header"), 400);
  }

  // Verify the signed amount matches our expected amount
  const paymentRequirements = {
    scheme: "exact" as const,
    network: NETWORK,
    amount,
    payTo: PAY_TO_ADDRESS,
    asset: networkConfig.usdcAddress,
    maxTimeoutSeconds: 3600,
    extra: {},
  };

  // Settle payment via facilitator
  let settleResult: Awaited<ReturnType<typeof facilitatorClient.settle>>;
  try {
    settleResult = await facilitatorClient.settle(
      paymentPayload,
      paymentRequirements as Parameters<typeof facilitatorClient.settle>[1],
    );
  } catch (err) {
    return c.json({ error: { code: "payment_failed", message: `Payment settlement failed: ${String(err)}` } }, 502);
  }

  if (!settleResult.success) {
    return c.json({ error: { code: "payment_failed", message: "Payment settlement failed" } }, 502);
  }

  // Extract payer wallet from payment header
  let callerWallet: string | undefined;
  try {
    const decoded = paymentPayload as { payload?: { authorization?: { from?: string } }; authorization?: { from?: string }; from?: string };
    callerWallet = decoded.payload?.authorization?.from ?? decoded.authorization?.from ?? decoded.from;
  } catch (err) {
    logger.warn("wallet extraction from payment header failed", { error: String(err) });
    callerWallet = undefined;
  }
  if (!callerWallet) return c.json(forbidden("Could not determine payer wallet"), 403);

  const result = await registerDomain(quoteId, callerWallet);
  if (!result.ok) {
    return c.json({ error: { code: result.code, message: result.message } }, result.status as 400 | 404 | 410 | 502 | 503);
  }
  return c.json(result.data as RegisterResponse, 201);
});

// POST /v1/domains/recover — Retry Cloudflare setup after NameSilo succeeded
// Free route — recovery_token is sufficient auth.
app.post("/v1/domains/recover", async (c) => {
  let body: RecoverRequest;
  try {
    body = await c.req.json<RecoverRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/domains/recover", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  if (!body.recovery_token) return c.json(invalidRequest("recovery_token is required"), 400);

  // Wallet from payment-signature header (set by middleware's extractWalletAddress)
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address — include payment-signature header"), 403);

  const result = await recoverRegistration(body.recovery_token, caller);
  if (!result.ok) {
    if (result.status === 404) return c.json({ error: { code: result.code, message: result.message } }, 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json({ error: { code: result.code, message: result.message } }, result.status as 400 | 502);
  }
  return c.json(result.data as RecoverResponse, 200);
});

// POST /v1/domains/:domain/configure-ns — Retry nameserver change at registrar
// Free route — wallet ownership of registration required.
app.post("/v1/domains/:domain/configure-ns", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address — include payment-signature header"), 403);

  const domain = c.req.param("domain");
  const result = await configureNs(domain, caller);
  if (!result.ok) {
    if (result.status === 404) return c.json({ error: { code: result.code, message: result.message } }, 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.status === 400) return c.json(invalidRequest(result.message), 400);
    return c.json({ error: { code: result.code, message: result.message } }, result.status as 502 | 503);
  }
  return c.json(result.data as ConfigureNsResponse, 200);
});

// GET /v1/domains/:domain/status — Registration status (post-registration pipeline)
app.get("/v1/domains/:domain/status", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const domain = c.req.param("domain");
  const result = await getRegistrationStatus(domain, caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json({ error: { code: result.code, message: result.message } }, result.status as 400);
  }
  return c.json(result.data as RegistrationStatusResponse, 200);
});

// GET /v1/domains/search — Check availability + pricing for domains
app.get("/v1/domains/search", async (c) => {
  const query = c.req.query("query");
  if (!query) return c.json(invalidRequest("query parameter is required"), 400);

  const tldsParam = c.req.query("tlds");
  const tlds = tldsParam ? tldsParam.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const result = await searchDomains(query, tlds);
  if (!result.ok) {
    if (result.status === 503) return c.json(serviceUnavailable(result.message), 503);
    return c.json(invalidRequest(result.message), 400);
  }
  return c.json(result.data as DomainSearchResponse, 200);
});

// POST /v1/zones — Create zone
app.post("/v1/zones", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateZoneRequest;
  try {
    body = await c.req.json<CreateZoneRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/zones", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await createZone(body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request" || result.code === "domain_taken") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data as CreateZoneResponse, 201);
});

// GET /v1/zones — List zones
app.get("/v1/zones", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const limit = Math.min(Number(c.req.query("limit")) || 20, 100);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);

  const data = listZones(caller, limit, page);
  return c.json(data as ZoneListResponse, 200);
});

// GET /v1/zones/:id — Get zone
app.get("/v1/zones/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await getZone(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as ZoneResponse, 200);
});

// DELETE /v1/zones/:id — Delete zone
app.delete("/v1/zones/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await deleteZone(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data, 200);
});

// GET /v1/zones/:zone_id/verify — Check DNS propagation (NS + all records)
app.get("/v1/zones/:zone_id/verify", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await verifyZone(c.req.param("zone_id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as VerifyResponse, 200);
});

// PUT /v1/zones/:zone_id/activate — Request CF to immediately re-check NS activation
app.put("/v1/zones/:zone_id/activate", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await activateZone(c.req.param("zone_id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.status === 429) return c.json({ error: { code: result.code, message: result.message } }, 429);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data as ActivateResponse, 200);
});

// POST /v1/zones/:zone_id/mail-setup — Configure mail DNS records (MX+SPF+DMARC+DKIM)
app.post("/v1/zones/:zone_id/mail-setup", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: MailSetupRequest;
  try {
    body = await c.req.json<MailSetupRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/zones/:zone_id/mail-setup", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await mailSetup(c.req.param("zone_id"), body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data as MailSetupResponse, 200);
});

// POST /v1/zones/:zone_id/records/batch — Batch create/update/delete records
app.post("/v1/zones/:zone_id/records/batch", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: BatchRecordsRequest;
  try {
    body = await c.req.json<BatchRecordsRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/zones/:zone_id/records/batch", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await batchRecords(c.req.param("zone_id"), body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.status === 500) return c.json({ error: { code: "internal_error", message: result.message } }, 500);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data as BatchRecordsResponse, 200);
});

// POST /v1/zones/:zone_id/records — Create record
app.post("/v1/zones/:zone_id/records", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateRecordRequest;
  try {
    body = await c.req.json<CreateRecordRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/zones/:zone_id/records", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await createRecord(c.req.param("zone_id"), body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data as RecordResponse, 201);
});

// GET /v1/zones/:zone_id/records — List records
app.get("/v1/zones/:zone_id/records", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = listRecords(c.req.param("zone_id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as RecordListResponse, 200);
});

// GET /v1/zones/:zone_id/records/:id — Get record
app.get("/v1/zones/:zone_id/records/:id", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getRecord(c.req.param("zone_id"), c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as RecordResponse, 200);
});

// PUT /v1/zones/:zone_id/records/:id — Update record
app.put("/v1/zones/:zone_id/records/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: UpdateRecordRequest;
  try {
    body = await c.req.json<UpdateRecordRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on PUT /v1/zones/:zone_id/records/:id", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await updateRecord(c.req.param("zone_id"), c.req.param("id"), body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data as RecordResponse, 200);
});

// DELETE /v1/zones/:zone_id/records/:id — Delete record
app.delete("/v1/zones/:zone_id/records/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await deleteRecord(c.req.param("zone_id"), c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data, 200);
});

export default app;
