import { afterAll } from "vitest";
import { applyTestEnv } from "./env";

applyTestEnv();

afterAll(async () => {
  const { closePool } = await import("../../src/lib/server/db");
  await closePool();
});
