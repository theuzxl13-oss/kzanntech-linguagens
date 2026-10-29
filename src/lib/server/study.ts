import type { PoolClient } from "pg";
import { addDays, isoWeekKey, localDate, startOfIsoWeekUtc } from "../domain/dates";
import { levelFromXp } from "../domain/scoring";
import { getScoringRules } from "./settings";

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

/**
 * Bônus da meta semanal: concedido uma vez por semana (ISO, UTC) quando o XP da semana atinge a meta
 * do perfil, venha o XP de sessões, lições ou missões. Idempotente por (usuário, semana).
 * Chame depois de gravar o XP da atividade, na mesma transação.
 */
export async function awardWeeklyGoalIfReached(client: PoolClient, userId: string, now = new Date()): Promise<number> {
  const rules = await getScoringRules(client);
  const goal = (await client.query<{ weekly_goal_xp: number }>(`select weekly_goal_xp from profiles where user_id = $1`, [userId])).rows[0]?.weekly_goal_xp ?? 300;
  const weekXp = (
    await client.query<{ xp: number }>(`select coalesce(sum(amount), 0)::int as xp from xp_events where user_id = $1 and created_at >= $2`, [
      userId,
      startOfIsoWeekUtc(now),
    ])
  ).rows[0].xp;
  if (weekXp < goal || rules.xp.weeklyGoalBonus <= 0) return 0;
  const ins = await client.query(`insert into xp_events (user_id, source, ref, amount) values ($1,'weekly_goal',$2,$3) on conflict do nothing`, [
    userId,
    isoWeekKey(now),
    rules.xp.weeklyGoalBonus,
  ]);
  return ins.rowCount ? rules.xp.weeklyGoalBonus : 0;
}
