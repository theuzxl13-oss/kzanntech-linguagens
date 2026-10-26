import { E2E_DATABASE_URL } from "../../playwright.config";

export default async function setup() {
  process.env.DATABASE_URL = E2E_DATABASE_URL;
  process.env.AUTH_SECRET = "e2e-secret-e2e-secret-e2e-secret-e2e-secret";
  const { getPool, closePool, tx } = await import("../../src/lib/server/db");
  await getPool().query("drop schema public cascade; create schema public;");
  const { migrate } = await import("../../scripts/migrate");
  await migrate(() => {});
  const { seedCatalog, seedAdmin } = await import("../../scripts/seed");
  await tx(async (c) => {
    await seedCatalog(c, () => {});
    await seedAdmin(c, "admin@keylingo.test", "AdminSenha123", () => {});
  });
  await closePool();
}
