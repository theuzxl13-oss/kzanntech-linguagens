import { applyTestEnv, TEST_DATABASE_URL } from "./env";

export default async function setup() {
  if (!/test/.test(TEST_DATABASE_URL)) throw new Error("TEST_DATABASE_URL precisa apontar para um banco de testes.");
  applyTestEnv();
  const { getPool, closePool, tx } = await import("../../src/lib/server/db");
  await getPool().query("drop schema public cascade; create schema public;");
  const { migrate } = await import("../../scripts/migrate");
  await migrate(() => {});
  const { seedCatalog } = await import("../../scripts/seed");
  await tx((c) => seedCatalog(c, () => {}));
  await closePool();
}
