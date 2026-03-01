import { resolve } from "node:path";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  forbidden,
  invalidRequest,
  notFound,
} from "@primsh/x402-middleware";
import type { ApiError, PaginatedList } from "@primsh/x402-middleware";
import { getNetworkConfig } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import {
  HTTPFacilitatorClient,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
} from "@x402/core/http";
import type {
  ActivateResponse,
  BatchRecordsRequest,
  BatchRecordsResponse,
  ConfigureNsResponse,
  CreateRecordRequest,
  CreateZoneRequest,
  CreateZoneResponse,
  DomainSearchResponse,
  MailSetupRequest,
  MailSetupResponse,
  QuoteRequest,
  QuoteResponse,
  RecordResponse,
  RecoverRequest,
  RecoverResponse,
  RegisterResponse,
  RegistrationStatusResponse,
  UpdateRecordRequest,
  VerifyResponse,
  ZoneResponse,
} from "./api.ts";
import { getQuoteById } from "./db.ts";
import {
  activateZone,
  batchRecords,
  centsToAtomicUsdc,
  configureNs,
  createRecord,
  createZone,
  deleteRecord,
  deleteZone,
  getRecord,
  getRegistrationStatus,
  getZone,
  listRecords,
  listZones,
  mailSetup,
  quoteDomain,
  recoverRegistration,
  registerDomain,
  searchDomains,
  updateRecord,
  verifyZone,
} from "./service.ts";

const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO;
if (!PAY_TO_ADDRESS) {
  throw new Error("[domain.sh] PRIM_PAY_TO environment variable is required");
}
const NETWORK = process.env.PRIM_NETWORK ?? "eip155:8453";

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

const app = createPrimApp(
  {
    serviceName: "domain.sh",
    llmsTxtPath: import.meta.dir
      ? resolve(import.meta.dir, "../../../site/domain/llms.txt")
      : undefined,
    routes: DOMAIN_ROUTES,
    extraFreeRoutes: ["POST /v1/domains/recover", "POST /v1/domains/[domain]/configure-ns"],
    metricsName: "domain.prim.sh",
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = app.logger;

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
  if (quote.expires_at < Date.now())
    return c.json({ error: { code: "quote_expired", message: "Quote has expired" } }, 410);

  // Build expected payment amount from quote
  const amount = centsToAtomicUsdc(quote.total_cents);
  const networkConfig = getNetworkConfig(NETWORK);

  const paymentHeader = c.req.header("payment-signature") ?? c.req.header("x-payment");

  if (!paymentHeader) {
    const paymentRequired = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact" as const,
          network: NETWORK,
          amount,
          payTo: PAY_TO_ADDRESS,
          asset: networkConfig.usdcAddress,
          maxTimeoutSeconds: 3600,
          extra: {},
        },
      ],
      resource: {
        url: `${c.req.url}`,
        description: `Domain registration: ${quote.domain}`,
        mimeType: "application/json",
      },
    };
    const encoded = encodePaymentRequiredHeader(
      paymentRequired as Parameters<typeof encodePaymentRequiredHeader>[0],
    );
    return new Response(
      JSON.stringify({ error: { code: "payment_required", message: "Payment required" } }),
      {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "payment-required": encoded,
        },
      },
    );
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
    return c.json(
      { error: { code: "payment_failed", message: `Payment settlement failed: ${String(err)}` } },
      502,
    );
  }

  if (!settleResult.success) {
    return c.json({ error: { code: "payment_failed", message: "Payment settlement failed" } }, 502);
  }

  // Extract payer wallet from payment header
  let callerWallet: string | undefined;
  try {
    const decoded = paymentPayload as {
      payload?: { authorization?: { from?: string } };
      authorization?: { from?: string };
      from?: string;
    };
    callerWallet =
      decoded.payload?.authorization?.from ?? decoded.authorization?.from ?? decoded.from;
  } catch (err) {
    logger.warn("wallet extraction from payment header failed", { error: String(err) });
    callerWallet = undefined;
  }
  if (!callerWallet) return c.json(forbidden("Could not determine payer wallet"), 403);

  const result = await registerDomain(quoteId, callerWallet);
  if (!result.ok) {
    return c.json(
      { error: { code: result.code, message: result.message } },
      result.status as 400 | 404 | 410 | 502 | 503,
    );
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
  if (!caller)
    return c.json(forbidden("No wallet address — include payment-signature header"), 403);

  const result = await recoverRegistration(body.recovery_token, caller);
  if (!result.ok) {
    if (result.status === 404)
      return c.json({ error: { code: result.code, message: result.message } }, 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(
      { error: { code: result.code, message: result.message } },
      result.status as 400 | 502,
    );
  }
  return c.json(result.data as RecoverResponse, 200);
});

// POST /v1/domains/:domain/configure-ns — Retry nameserver change at registrar
// Free route — wallet ownership of registration required.
app.post("/v1/domains/:domain/configure-ns", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller)
    return c.json(forbidden("No wallet address — include payment-signature header"), 403);

  const domain = c.req.param("domain");
  const result = await configureNs(domain, caller);
  if (!result.ok) {
    if (result.status === 404)
      return c.json({ error: { code: result.code, message: result.message } }, 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.status === 400) return c.json(invalidRequest(result.message), 400);
    return c.json(
      { error: { code: result.code, message: result.message } },
      result.status as 502 | 503,
    );
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
  const tlds = tldsParam
    ? tldsParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

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
    if (result.code === "invalid_request" || result.code === "domain_taken")
      return c.json(invalidRequest(result.message), 400);
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
  return c.json(data as PaginatedList<ZoneResponse>, 200);
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
    if (result.status === 429)
      return c.json({ error: { code: result.code, message: result.message } }, 429);
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
    logger.warn("JSON parse failed on POST /v1/zones/:zone_id/records/batch", {
      error: String(err),
    });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await batchRecords(c.req.param("zone_id"), body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.status === 500)
      return c.json({ error: { code: "internal_error", message: result.message } }, 500);
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
  return c.json(result.data as PaginatedList<RecordResponse>, 200);
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
