import path from "node:path";
import { defineConfig } from "vitest/config";

const integration = process.env.VITEST_SUITE === "integration";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // "server-only" só existe para o bundler do Next; nos testes é um módulo vazio.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: integration ? ["tests/integration/**/*.test.ts"] : ["tests/unit/**/*.test.ts"],
    globalSetup: integration ? ["tests/integration/global-setup.ts"] : [],
    setupFiles: integration ? ["tests/integration/setup.ts"] : [],
    fileParallelism: !integration,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
