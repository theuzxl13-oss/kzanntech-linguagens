import { Pool, type PoolClient, type QueryResultRow } from "pg";

// Pool único por processo (reaproveitado entre recargas no modo dev).
const globalForDb = globalThis as unknown as { __keylingoPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada. Veja .env.example.");
  }
  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({
    connectionString,
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err) => {
    console.error("[db] erro inesperado no pool", err);
  });
  return pool;
}

export function getPool(): Pool {
  if (!globalForDb.__keylingoPool) globalForDb.__keylingoPool = createPool();
  return globalForDb.__keylingoPool;
}

export type Queryable = Pick<PoolClient, "query">;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: Queryable,
): Promise<T[]> {
  const res = await (client ?? getPool()).query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: Queryable,
): Promise<T | null> {
  const rows = await query<T>(text, params, client);
  return rows[0] ?? null;
}

/** Executa `fn` dentro de uma transação, com rollback automático em caso de erro. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (globalForDb.__keylingoPool) {
    await globalForDb.__keylingoPool.end();
    globalForDb.__keylingoPool = undefined;
  }
}
