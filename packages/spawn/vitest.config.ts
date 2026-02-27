import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  define: {
    // Bun-specific global — undefined in vitest/Node. Inject src/ dir so
    // readFileSync(resolve(import.meta.dir, ...)) in src/index.ts doesn't crash.
    "import.meta.dir": JSON.stringify(path.resolve(__dirname, "src")),
  },
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
