import "./env";
import { closePool } from "../src/lib/server/db";
import { runMaintenance } from "../src/lib/server/maintenance";

// Limpeza de dados expirados conforme a política de retenção. Agende diariamente (cron, GitHub Actions, etc.).
runMaintenance()
  .then(async (counts) => {
    console.log("✔ manutenção concluída:", counts);
    await closePool();
  })
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exit(1);
  });
