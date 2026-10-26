import { query } from "./db";
import { tooMany } from "./errors";

/**
 * Limite de requisições por janela fixa, persistido no banco (funciona com várias instâncias).
 * Retorna true se a requisição é permitida.
 */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await query<{ count: number }>(
    `insert into rate_limits (key, window_start, count) values ($1, $2, 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1
     returning count`,
    [key, windowStart],
  );
  // Limpeza oportunista de janelas antigas
  if (Math.random() < 0.01) {
    await query(`delete from rate_limits where window_start < now() - interval '1 day'`).catch(() => {});
  }
  return rows[0].count <= limit;
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message?: string) {
  if (!(await hitRateLimit(key, limit, windowSeconds))) throw tooMany(message);
}
