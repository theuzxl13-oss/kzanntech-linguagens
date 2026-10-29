import type { PoolClient } from "pg";
import { addDays, localDate } from "../domain/dates";
import { levelFromXp } from "../domain/scoring";

/** Data local (fuso do perfil) usada para sequência e tetos diários. */
export async function userToday(client: PoolClient, userId: string): Promise<string> {
  const tz = (await client.query<{ timezone: string }>(`select timezone from profiles where user_id = $1`, [userId])).rows[0]?.timezone ?? "America/Sao_Paulo";
  return localDate(new Date(), tz);
}

/**
 * Registra um dia de estudo fora das sessões de jogo (lições, missões): soma XP já concedido em
 * xp_events, recalcula o nível e atualiza a sequência de dias. Deve rodar na mesma transação da concessão.
 */
export async function applyStudyDay(client: PoolClient, userId: string, xpGained: number, today: string) {
  const stats = (await client.query(`select xp_total, current_streak, last_study_date from user_stats where user_id = $1 for update`, [userId])).rows[0];
  const last = stats?.last_study_date
    ? `${stats.last_study_date.getFullYear()}-${String(stats.last_study_date.getMonth() + 1).padStart(2, "0")}-${String(stats.last_study_date.getDate()).padStart(2, "0")}`
    : null;
  const streak = last === today ? stats.current_streak : last === addDays(today, -1) ? stats.current_streak + 1 : 1;
  const xpTotal = (stats?.xp_total ?? 0) + xpGained;
  await client.query(
    `update user_stats set xp_total = $2, level = $3, current_streak = $4, longest_streak = greatest(longest_streak, $4), last_study_date = $5, updated_at = now()
      where user_id = $1`,
    [userId, xpTotal, levelFromXp(xpTotal), streak, today],
  );
}
