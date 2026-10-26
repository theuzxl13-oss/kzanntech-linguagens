import "./env";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { closePool, getPool } from "../src/lib/server/db";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

export async function migrate(log = console.log): Promise<string[]> {
  const pool = getPool();
  await pool.query(`create table if not exists schema_migrations (
    version text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`);
  await pool.query("alter table schema_migrations enable row level security");
  const applied = new Map(
    (await pool.query<{ version: string; checksum: string }>("select version, checksum from schema_migrations")).rows.map(
      (r) => [r.version, r.checksum],
    ),
  );
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const done: string[] = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const version = file.replace(/\.sql$/, "");
    const prev = applied.get(version);
    if (prev) {
      if (prev !== checksum) {
        throw new Error(`A migração ${file} foi alterada depois de aplicada. Crie uma nova migração em vez de editar.`);
      }
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (version, checksum) values ($1, $2)", [version, checksum]);
      await client.query("commit");
      log(`✔ migração aplicada: ${file}`);
      done.push(file);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`Falha na migração ${file}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  if (done.length === 0) log("Banco já está atualizado.");
  return done;
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  migrate()
    .then(() => closePool())
    .catch(async (err) => {
      console.error(err.message);
      await closePool();
      process.exit(1);
    });
}
