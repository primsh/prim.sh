import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "bun:sqlite": path.resolve(__dirname, "src/__mocks__/bun-sqlite.ts"),
    },
  },
  test: {
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
