// SPDX-License-Identifier: Apache-2.0
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    // Polyfill Bun-only import.meta.dir for vitest (Node)
    "import.meta.dir": JSON.stringify(path.resolve(__dirname, "src")),
  },
  resolve: {
    alias: {
      "bun:sqlite": path.resolve(__dirname, "src/__mocks__/bun-sqlite.ts"),
    },
  },
  test: {
    exclude: [
      "node_modules/**",
      "test/smoke-live.generated.test.ts",
      "test/smoke-live.custom.test.ts",
    ],
    environment: "node",
    coverage: {
      reportsDirectory: "./coverage",
      provider: "v8",
      reporter: ["text", "json", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
