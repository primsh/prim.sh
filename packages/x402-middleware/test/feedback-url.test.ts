import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { feedbackUrlMiddleware } from "../src/feedback-url.ts";

const FEEDBACK_URL = "https://feedback.prim.sh/v1/submit";

describe("feedbackUrlMiddleware", () => {
  it("sets X-Feedback-Url header on 200 responses", async () => {
    const app = new Hono();
    app.use("*", feedbackUrlMiddleware(FEEDBACK_URL));
    app.get("/", (c) => c.json({ service: "test.sh", status: "ok" }));

    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Feedback-Url")).toBe(FEEDBACK_URL);
    const body = await res.json();
    expect(body).not.toHaveProperty("feedback_url");
  });

  it("sets X-Feedback-Url header on error responses", async () => {
    const app = new Hono();
    app.use("*", feedbackUrlMiddleware(FEEDBACK_URL));
    app.post("/fail", (c) => c.json({ error: { code: "bad", message: "oops" } }, 400));

    const res = await app.request("/fail", { method: "POST" });
    expect(res.status).toBe(400);
    expect(res.headers.get("X-Feedback-Url")).toBe(FEEDBACK_URL);
  });

  it("injects feedback_url into JSON error body (status >= 400 with error key)", async () => {
    const app = new Hono();
    app.use("*", feedbackUrlMiddleware(FEEDBACK_URL));
    app.post("/fail", (c) => c.json({ error: { code: "bad", message: "oops" } }, 400));

    const res = await app.request("/fail", { method: "POST" });
    const body = await res.json();
    expect(body).toHaveProperty("feedback_url", FEEDBACK_URL);
    expect(body).toHaveProperty("error");
  });

  it("does NOT inject feedback_url into non-error JSON body (status < 400)", async () => {
    const app = new Hono();
    app.use("*", feedbackUrlMiddleware(FEEDBACK_URL));
    app.get("/ok", (c) => c.json({ data: "hello" }));

    const res = await app.request("/ok");
    const body = await res.json();
    expect(body).not.toHaveProperty("feedback_url");
  });

  it("does NOT inject feedback_url into error JSON without 'error' key", async () => {
    const app = new Hono();
    app.use("*", feedbackUrlMiddleware(FEEDBACK_URL));
    app.post("/fail", (c) => c.json({ message: "no error key" }, 500));

    const res = await app.request("/fail", { method: "POST" });
    const body = await res.json();
    expect(body).not.toHaveProperty("feedback_url");
    // Header should still be set
    expect(res.headers.get("X-Feedback-Url")).toBe(FEEDBACK_URL);
  });

  it("does NOT inject into non-JSON error responses (header only)", async () => {
    const app = new Hono();
    app.use("*", feedbackUrlMiddleware(FEEDBACK_URL));
    app.post("/text-error", (c) => {
      return c.text("plain error", 500);
    });

    const res = await app.request("/text-error", { method: "POST" });
    expect(res.headers.get("X-Feedback-Url")).toBe(FEEDBACK_URL);
    const text = await res.text();
    expect(text).toBe("plain error");
  });
});
