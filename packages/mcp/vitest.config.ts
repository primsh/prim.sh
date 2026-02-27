import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // x402-middleware points to dist/ which doesn't exist in dev — alias to source
      "@primsh/x402-middleware": path.resolve(
        __dirname,
        "../../packages/x402-middleware/src/index.ts",
      ),
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
