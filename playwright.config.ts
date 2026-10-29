import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// Com E2E_BASE_URL, os testes rodam contra um servidor já iniciado (ex.: o preview do Cloudflare).
const EXTERNAL = process.env.E2E_BASE_URL;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://keylingo:keylingo@localhost:5432/keylingo_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    baseURL: EXTERNAL ?? `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: EXTERNAL
    ? undefined
    : {
    // Testa o build de produção (execute `npm run build` antes)
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_URL: `http://localhost:${PORT}`,
      EMAIL_TRANSPORT: "log",
      // Somente testes: permite capturar links de e-mail no build de produção
      ALLOW_LOG_EMAIL_IN_PRODUCTION: "true",
      SPEECH_PROVIDER: "none",
      // Somente testes: pagamentos simulados no build de produção
      BILLING_PROVIDER: "sandbox",
      ALLOW_SANDBOX_BILLING_IN_PRODUCTION: "true",
      BILLING_WEBHOOK_SECRET: "e2e-billing-webhook-secret",
      AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
    },
  },
});
