// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["node_modules/**", "test/smoke-live.generated.test.ts", "test/smoke-live.custom.test.ts"],
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
