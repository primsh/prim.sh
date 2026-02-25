import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createPrincipal, getPrincipal, deletePrincipal, StalwartError } from "../src/stalwart";

const MOCK_URL = "http://localhost:8080";
const MOCK_CREDS = "admin:secret";

describe("stalwart client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.STALWART_API_URL = MOCK_URL;
    process.env.STALWART_API_CREDENTIALS = MOCK_CREDS;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.STALWART_API_URL = undefined;
    process.env.STALWART_API_CREDENTIALS = undefined;
  });

  describe("createPrincipal", () => {
    it("sends correct body and returns principal ID", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 42 }),
      });

      const result = await createPrincipal({
        type: "individual",
        name: "testuser",
        secrets: ["password123"],
        emails: ["[email protected]"],
        roles: ["user"],
      });

      expect(result).toBe(42);

      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toBe(`${MOCK_URL}/api/principal`);
      expect(call[1].method).toBe("POST");

      const body = JSON.parse(call[1].body as string);
      expect(body.type).toBe("individual");
      expect(body.name).toBe("testuser");
      expect(body.secrets).toEqual(["password123"]);
      expect(body.emails).toEqual(["[email protected]"]);
    });

    it("includes Basic auth header", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 1 }),
      });

      await createPrincipal({
        type: "individual",
        name: "x",
        secrets: ["p"],
        emails: ["[email protected]"],
      });

      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const expected = `Basic ${Buffer.from(MOCK_CREDS).toString("base64")}`;
      expect(call[1].headers.Authorization).toBe(expected);
    });
  });

  describe("getPrincipal", () => {
    it("returns principal data", async () => {
      const principal = { id: 42, type: "individual", name: "testuser", emails: ["[email protected]"] };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: principal }),
      });

      const result = await getPrincipal("testuser");
      expect(result).toEqual(principal);

      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toBe(`${MOCK_URL}/api/principal/testuser`);
    });
  });

  describe("deletePrincipal", () => {
    it("calls DELETE and returns void", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: null }),
      });

      await deletePrincipal("testuser");

      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toBe(`${MOCK_URL}/api/principal/testuser`);
      expect(call[1].method).toBe("DELETE");
    });
  });

  describe("error mapping", () => {
    it("maps 404 to not_found", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Principal not found" }),
      });

      await expect(getPrincipal("missing")).rejects.toThrow(StalwartError);
      try {
        await getPrincipal("missing");
      } catch (err) {
        expect((err as StalwartError).code).toBe("not_found");
        expect((err as StalwartError).statusCode).toBe(404);
      }
    });

    it("maps 401 to forbidden", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      try {
        await getPrincipal("x");
      } catch (err) {
        expect((err as StalwartError).code).toBe("forbidden");
      }
    });

    it("maps 409 to conflict", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "Already exists" }),
      });

      try {
        await createPrincipal({
          type: "individual",
          name: "dup",
          secrets: ["p"],
          emails: ["[email protected]"],
        });
      } catch (err) {
        expect((err as StalwartError).code).toBe("conflict");
      }
    });

    it("maps 500 to stalwart_error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal error" }),
      });

      try {
        await getPrincipal("x");
      } catch (err) {
        expect((err as StalwartError).code).toBe("stalwart_error");
        expect((err as StalwartError).message).toBe("Internal error");
      }
    });

    it("maps 200 + fieldAlreadyExists body to 409 conflict", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ error: "fieldAlreadyExists" }),
      });

      try {
        await createPrincipal({
          type: "individual",
          name: "dup",
          secrets: ["p"],
          emails: ["[email protected]"],
        });
      } catch (err) {
        expect((err as StalwartError).code).toBe("conflict");
        expect((err as StalwartError).statusCode).toBe(409);
      }
    });

    it("maps 200 + unknown error body to 500 stalwart_error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ error: "someUnexpectedError" }),
      });

      try {
        await getPrincipal("x");
      } catch (err) {
        expect((err as StalwartError).code).toBe("stalwart_error");
        expect((err as StalwartError).statusCode).toBe(500);
        expect((err as StalwartError).message).toBe("someUnexpectedError");
      }
    });

    it("handles malformed JSON response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("not JSON");
        },
      });

      try {
        await getPrincipal("x");
      } catch (err) {
        expect((err as StalwartError).code).toBe("stalwart_error");
        expect((err as StalwartError).statusCode).toBe(502);
      }
    });
  });
});
