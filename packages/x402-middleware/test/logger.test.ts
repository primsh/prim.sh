import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Logger, createLogger } from "../src/logger.ts";
import { getRequestId, requestIdMiddleware } from "../src/request-id.ts";

// Capture stdout writes for assertions
function captureStdout() {
  const lines: string[] = [];
  const original = process.stdout.write;
  process.stdout.write = ((chunk: string) => {
    lines.push(chunk);
    return true;
  }) as typeof process.stdout.write;
  return {
    lines,
    restore() {
      process.stdout.write = original;
    },
  };
}

describe("createLogger", () => {
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    // biome-ignore lint/performance/noDelete: env vars require delete to remove (= undefined sets "undefined")
    delete process.env.LOG_LEVEL;
    // biome-ignore lint/performance/noDelete: env vars require delete to remove (= undefined sets "undefined")
    delete process.env.NODE_ENV;
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  it("writes valid JSON with correct fields", () => {
    const log = createLogger("test.sh");
    log.info("hello");

    expect(capture.lines.length).toBe(1);
    const parsed = JSON.parse(capture.lines[0]);
    expect(parsed.level).toBe("info");
    expect(parsed.service).toBe("test.sh");
    expect(parsed.msg).toBe("hello");
    expect(parsed.request_id).toBeNull();
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes extra fields", () => {
    const log = createLogger("test.sh");
    log.info("with extras", { wallet: "0xABC", count: 42 });

    const parsed = JSON.parse(capture.lines[0]);
    expect(parsed.wallet).toBe("0xABC");
    expect(parsed.count).toBe(42);
  });

  it("respects LOG_LEVEL=error — suppresses info and warn", () => {
    process.env.LOG_LEVEL = "error";
    const log = createLogger("test.sh");

    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");

    expect(capture.lines.length).toBe(1);
    const parsed = JSON.parse(capture.lines[0]);
    expect(parsed.level).toBe("error");
  });

  it("respects LOG_LEVEL=warn — allows warn and error", () => {
    process.env.LOG_LEVEL = "warn";
    const log = createLogger("test.sh");

    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");

    expect(capture.lines.length).toBe(2);
    expect(JSON.parse(capture.lines[0]).level).toBe("warn");
    expect(JSON.parse(capture.lines[1]).level).toBe("error");
  });

  it("defaults to debug level when NODE_ENV=development", () => {
    process.env.NODE_ENV = "development";
    const log = createLogger("test.sh");

    log.debug("d");
    expect(capture.lines.length).toBe(1);
    expect(JSON.parse(capture.lines[0]).level).toBe("debug");
  });

  it("child() merges extra fields into output", () => {
    const log = createLogger("test.sh");
    const child = log.child({ module: "foo" });

    child.info("scoped");

    const parsed = JSON.parse(capture.lines[0]);
    expect(parsed.module).toBe("foo");
    expect(parsed.service).toBe("test.sh");
    expect(parsed.msg).toBe("scoped");
  });

  it("child() call-site extra overrides base extra", () => {
    const log = createLogger("test.sh");
    const child = log.child({ module: "foo", k: 1 });

    child.info("override", { k: 2 });

    const parsed = JSON.parse(capture.lines[0]);
    expect(parsed.k).toBe(2);
  });
});

describe("getRequestId", () => {
  it("returns null outside ALS context", () => {
    expect(getRequestId()).toBeNull();
  });
});

describe("requestIdMiddleware", () => {
  it("generates a request ID and sets it on context and response header", async () => {
    const app = new Hono();
    app.use("*", requestIdMiddleware());
    app.get("/", (c) => c.json({ id: c.get("requestId") }));

    const res = await app.request("/");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBe(12);

    expect(res.headers.get("x-request-id")).toBe(body.id);
  });

  it("reuses X-Request-Id from incoming request header", async () => {
    const app = new Hono();
    app.use("*", requestIdMiddleware());
    app.get("/", (c) => c.json({ id: c.get("requestId") }));

    const res = await app.request("/", {
      headers: { "X-Request-Id": "my-trace-123" },
    });

    const body = await res.json();
    expect(body.id).toBe("my-trace-123");
    expect(res.headers.get("x-request-id")).toBe("my-trace-123");
  });

  it("makes request_id available to logger via AsyncLocalStorage", async () => {
    let capture: ReturnType<typeof captureStdout>;
    const log = createLogger("test.sh");

    const app = new Hono();
    app.use("*", requestIdMiddleware());
    app.get("/", (c) => {
      capture = captureStdout();
      log.info("inside handler");
      capture.restore();
      return c.json({ ok: true });
    });

    await app.request("/", {
      headers: { "X-Request-Id": "req-abc" },
    });

    // biome-ignore lint/style/noNonNullAssertion: test setup guarantees capture is defined
    const parsed = JSON.parse(capture!.lines[0]);
    expect(parsed.request_id).toBe("req-abc");
  });
});
