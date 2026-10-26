import { Client, Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Acesso ao PostgreSQL em dois ambientes:
 *  - Node.js (dev, testes, servidores tradicionais): um pool por processo.
 *  - Cloudflare Workers: conexões não podem ser compartilhadas entre requisições, então cada
 *    operação abre e fecha a sua. O Hyperdrive (binding HYPERDRIVE) faz o pooling real do lado
 *    do Cloudflare, o que mantém esse padrão barato.
 */
const isWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

// Pool único por processo (reaproveitado entre recargas no modo dev).
const globalForDb = globalThis as unknown as { __keylingoPool?: Pool };

function sslOption() {
  return process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada. Veja .env.example.");
  }
  const pool = new Pool({
    connectionString,
    ssl: sslOption(),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err) => {
    console.error("[db] erro inesperado no pool", err);
  });
  return pool;
}

export function getPool(): Pool {
  if (isWorkers) throw new Error("getPool() não está disponível no Cloudflare Workers.");
  if (!globalForDb.__keylingoPool) globalForDb.__keylingoPool = createPool();
  return globalForDb.__keylingoPool;
}

type CfContext = { env: { HYPERDRIVE?: { connectionString: string } }; ctx: { waitUntil(p: Promise<unknown>): void } };

async function cloudflareContext(): Promise<CfContext> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  return getCloudflareContext() as unknown as CfContext;
}

/** Abre uma conexão no Workers (via Hyperdrive quando configurado). */
async function workersClient(cf: CfContext): Promise<Client> {
  const viaHyperdrive = cf.env.HYPERDRIVE?.connectionString;
  const connectionString = viaHyperdrive ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Configure o binding HYPERDRIVE ou DATABASE_URL no Cloudflare.");
  // O Hyperdrive já faz TLS até o banco; a conexão Worker → Hyperdrive dispensa SSL.
  const client = new Client({ connectionString, ssl: viaHyperdrive ? undefined : sslOption() });
  // O socket do Workers emite "error" ao ser fechado; sem ouvinte isso viraria rejeição não tratada.
  client.on("error", () => {});
  await client.connect();
  return client;
}

/**
 * Uma conexão compartilhada por requisição (o contexto de execução identifica a requisição).
 * Fecha sozinha quando fica ociosa; consultas posteriores na mesma requisição reabrem.
 */
interface Shared {
  client: Promise<Client>;
  pending: number;
  timer?: ReturnType<typeof setTimeout>;
}
const sharedByRequest = new WeakMap<object, Shared>();

async function withRequestClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const cf = await cloudflareContext();
  let shared = sharedByRequest.get(cf.ctx);
  if (!shared) {
    shared = { client: workersClient(cf), pending: 0 };
    sharedByRequest.set(cf.ctx, shared);
  }
  const entry = shared;
  if (entry.timer) clearTimeout(entry.timer);
  entry.pending++;
  try {
    return await fn(await entry.client);
  } catch (err) {
    if (sharedByRequest.get(cf.ctx) === entry && !(await entry.client.then(() => true, () => false))) sharedByRequest.delete(cf.ctx);
    throw err;
  } finally {
    entry.pending--;
    if (entry.pending === 0) {
      entry.timer = setTimeout(() => {
        if (entry.pending > 0 || sharedByRequest.get(cf.ctx) !== entry) return;
        sharedByRequest.delete(cf.ctx);
        cf.ctx.waitUntil(entry.client.then((c) => c.end()).catch(() => {}));
      }, 25);
    }
  }
}

export type Queryable = Pick<PoolClient, "query">;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: Queryable,
): Promise<T[]> {
  if (client) return (await client.query<T>(text, params)).rows;
  if (!isWorkers) return (await getPool().query<T>(text, params)).rows;
  return withRequestClient(async (c) => (await c.query<T>(text, params)).rows);
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
  let client: PoolClient;
  let done: () => Promise<void>;
  if (isWorkers) {
    // Transações usam conexão própria, para não misturar consultas concorrentes da requisição.
    const c = await workersClient(await cloudflareContext());
    client = Object.assign(c, { release: () => {} }) as unknown as PoolClient;
    done = () => c.end().catch(() => {});
  } else {
    const c = await getPool().connect();
    client = c;
    done = async () => c.release();
  }
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await done();
  }
}

/** Objeto com `query` utilizável em qualquer ambiente (para funções que recebem um Queryable). */
export const db: Queryable = {
  query: (async (text: string, params?: unknown[]) => ({ rows: await query(text, params ?? []) })) as unknown as Queryable["query"],
};

export async function closePool(): Promise<void> {
  if (globalForDb.__keylingoPool) {
    await globalForDb.__keylingoPool.end();
    globalForDb.__keylingoPool = undefined;
  }
}
