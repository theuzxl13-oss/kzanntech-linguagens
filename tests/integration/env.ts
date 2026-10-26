export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://keylingo:keylingo@localhost:5432/keylingo_test";

export function applyTestEnv() {
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    DATABASE_SSL: "false",
    AUTH_SECRET: "test-secret-test-secret-test-secret-test-secret",
    EMAIL_TRANSPORT: "log",
    SPEECH_PROVIDER: "mock",
    VOICE_ALLOW_CLIENT_RANKED: "false",
    APP_URL: "http://localhost:3000",
  });
}
