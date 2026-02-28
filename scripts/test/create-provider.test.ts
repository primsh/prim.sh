import { describe, expect, it } from "vitest";
import {
  genVendorTs,
  parseProviderInterfaceFromSource,
  toPascalCase,
} from "../lib/provider-gen.ts";

// ── toPascalCase ────────────────────────────────────────────────────────────

describe("toPascalCase", () => {
  it("converts kebab-case", () => {
    expect(toPascalCase("my-vendor")).toBe("MyVendor");
  });

  it("converts snake_case", () => {
    expect(toPascalCase("my_vendor")).toBe("MyVendor");
  });

  it("handles single word", () => {
    expect(toPascalCase("serper")).toBe("Serper");
  });
});

// ── genVendorTs ─────────────────────────────────────────────────────────────

describe("genVendorTs", () => {
  it("generates valid vendor file with correct class name", () => {
    const result = genVendorTs("search", "SearchProvider", "serper", "SERPER_API_KEY");

    expect(result).toContain("class SerperClient implements SearchProvider");
    expect(result).toContain('import { ProviderError } from "./provider.ts"');
    expect(result).toContain("import type { SearchProvider }");
    expect(result).toContain("process.env.SERPER_API_KEY");
    expect(result).toContain('"SERPER_API_KEY is not configured"');
  });

  it("generates singleton pattern with resetClient and getClient", () => {
    const result = genVendorTs("track", "TrackProvider", "shipengine", "SHIPENGINE_API_KEY");

    expect(result).toContain("export function resetClient(): void");
    expect(result).toContain("export function getClient(): ShipengineClient");
    expect(result).toContain("let _client: ShipengineClient | undefined");
  });

  it("handles kebab-case vendor names", () => {
    const result = genVendorTs("search", "SearchProvider", "google-search", "GOOGLE_API_KEY");

    expect(result).toContain("class GoogleSearchClient implements SearchProvider");
    expect(result).toContain("export function getClient(): GoogleSearchClient");
  });

  it("uses the provided env key", () => {
    const result = genVendorTs("search", "SearchProvider", "tavily", "TAVILY_API_KEY");

    expect(result).toContain("process.env.TAVILY_API_KEY");
    expect(result).toContain('"TAVILY_API_KEY is not configured"');
  });
});

// ── parseProviderInterfaceFromSource ────────────────────────────────────────

describe("parseProviderInterfaceFromSource", () => {
  it("extracts interface name from standard pattern", () => {
    const src = `
export interface TrackProviderData {
  tracking_number: string
}

export interface TrackProvider {
  track(num: string): Promise<TrackProviderData>
}

export class ProviderError extends Error {}
`;
    const result = parseProviderInterfaceFromSource(src);

    expect(result).not.toBeNull();
    expect(result?.interfaceName).toBe("TrackProvider");
    expect(result?.dataTypeName).toBe("TrackProviderData");
  });

  it("picks first provider interface when multiple exist", () => {
    const src = `
export interface SearchProviderConfig { apiKey: string }
export interface SearchProviderParams { query: string }
export interface SearchProviderResult { results: any[] }

export interface SearchProvider {
  search(params: SearchProviderParams): Promise<SearchProviderResult>
}

export interface ExtractProvider {
  extract(urls: string[]): Promise<any>
}
`;
    const result = parseProviderInterfaceFromSource(src);

    expect(result).not.toBeNull();
    expect(result?.interfaceName).toBe("SearchProvider");
  });

  it("returns null when no provider interface found", () => {
    const src = "export class ProviderError extends Error {}";
    const result = parseProviderInterfaceFromSource(src);

    expect(result).toBeNull();
  });

  it("skips supporting types (ProviderConfig, ProviderData, etc.)", () => {
    const src = `
export interface InferProviderData {}
export interface InferProviderConfig {}
export interface InferProvider {
  chat(): Promise<InferProviderData>
}
`;
    const result = parseProviderInterfaceFromSource(src);

    expect(result).not.toBeNull();
    expect(result?.interfaceName).toBe("InferProvider");
    expect(result?.dataTypeName).toBe("InferProviderData");
  });

  it("returns null dataTypeName when no matching data type exists", () => {
    const src = `
export interface FooProvider {
  doStuff(): Promise<void>
}
`;
    const result = parseProviderInterfaceFromSource(src);

    expect(result).not.toBeNull();
    expect(result?.interfaceName).toBe("FooProvider");
    expect(result?.dataTypeName).toBeNull();
  });
});
