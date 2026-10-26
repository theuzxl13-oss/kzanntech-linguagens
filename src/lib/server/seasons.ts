import type { PoolClient } from "pg";
import { leagueFor, modalityScore, generalScore } from "../domain/scoring";
import { monthNamePt, startOfMonthUtc, startOfNextMonthUtc } from "../domain/dates";
import { query, tx, type Queryable } from "./db";
import { getScoringRules } from "./settings";

export interface Season {
  id: number;
  name: string;
  starts_at: Date;
  ends_at: Date;
  status: "scheduled" | "active" | "closed";
}

/** Congela a classificação final da temporada em season_results (histórico permanente). */
export async function snapshotSeason(client: PoolClient, season: Season) {
  const rules = await getScoringRules(client);
  const rows = await client.query<{ user_id: string; mode: string; language_code: string; pts: number[] }>(
    `select s.user_id, s.mode, s.language_code, array_agg(s.rank_points order by s.rank_points desc) as pts
       from game_sessions s
      where s.status = 'finished' and s.kind = 'ranked' and s.rank_points > 0
        and s.finished_at >= $1 and s.finished_at < $2
      group by s.user_id, s.mode, s.language_code`,
    [season.starts_at, season.ends_at],
  );
  // Placar por idioma ("*" = todos os idiomas)
  const boards = new Map<string, Map<string, { typing: number[]; voice: number[] }>>();
  for (const r of rows.rows) {
    for (const lang of ["*", r.language_code]) {
      const byUser = boards.get(lang) ?? new Map();
      const entry = byUser.get(r.user_id) ?? { typing: [], voice: [] };
      entry[r.mode as "typing" | "voice"].push(...r.pts);
      byUser.set(r.user_id, entry);
      boards.set(lang, byUser);
    }
  }
  for (const [lang, byUser] of boards) {
    const scored = [...byUser.entries()].map(([userId, e]) => {
      const typing = modalityScore(e.typing, rules);
      const voice = modalityScore(e.voice, rules);
      return { userId, typing, voice, general: generalScore(typing, voice) };
    });
    for (const board of ["typing", "voice", "general"] as const) {
      const sorted = scored.filter((s) => s[board] > 0).sort((a, b) => b[board] - a[board]);
      let position = 0;
      let prev = -1;
      for (const [i, s] of sorted.entries()) {
        if (s[board] !== prev) position = i + 1;
        prev = s[board];
        await client.query(
          `insert into season_results (season_id, user_id, board, language_code, points, position, league)
           values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
          [season.id, s.userId, board, lang, s[board], position, leagueFor(s.general, rules).code],
        );
      }
    }
  }
}

async function closeSeason(client: PoolClient, season: Season) {
  await snapshotSeason(client, season);
  await client.query(`update seasons set status = 'closed', closed_at = now() where id = $1`, [season.id]);
}

/**
 * Garante que existe uma temporada ativa cobrindo o instante atual.
 * Temporadas vencidas são encerradas (com histórico congelado) e uma nova temporada mensal é criada,
 * a menos que o administrador tenha agendado outra.
 */
export async function ensureActiveSeason(now = new Date()): Promise<Season> {
  const current = await query<Season>(`select * from seasons where status = 'active'`);
  if (current[0] && new Date(current[0].ends_at) > now && new Date(current[0].starts_at) <= now) return current[0];
  return tx(async (client) => {
    await client.query(`select pg_advisory_xact_lock(424242)`);
    const active = (await client.query<Season>(`select * from seasons where status = 'active' for update`)).rows[0];
    if (active && new Date(active.ends_at) > now) return active;
    if (active) await closeSeason(client, active);
    const scheduled = (
      await client.query<Season>(
        `select * from seasons where status = 'scheduled' and starts_at <= $1 and ends_at > $1 order by starts_at limit 1`,
        [now],
      )
    ).rows[0];
    if (scheduled) {
      return (await client.query<Season>(`update seasons set status = 'active' where id = $1 returning *`, [scheduled.id])).rows[0];
    }
    const start = active ? new Date(Math.max(new Date(active.ends_at).getTime(), startOfMonthUtc(now).getTime())) : startOfMonthUtc(now);
    const end = startOfNextMonthUtc(now);
    return (
      await client.query<Season>(`insert into seasons (name, starts_at, ends_at, status) values ($1,$2,$3,'active') returning *`, [
        `Temporada de ${monthNamePt(now)}`,
        start,
        end > start ? end : startOfNextMonthUtc(new Date(start.getTime() + 1)),
      ])
    ).rows[0];
  });
}

/** Encerramento manual pelo administrador: fecha a atual agora e inicia a próxima. */
export async function closeActiveSeasonNow(nextName: string, nextEndsAt: Date): Promise<Season> {
  return tx(async (client) => {
    await client.query(`select pg_advisory_xact_lock(424242)`);
    const active = (await client.query<Season>(`select * from seasons where status = 'active' for update`)).rows[0];
    const now = new Date();
    if (active) {
      await client.query(`update seasons set ends_at = $2 where id = $1`, [active.id, now]);
      await closeSeason(client, { ...active, ends_at: now });
    }
    return (
      await client.query<Season>(`insert into seasons (name, starts_at, ends_at, status) values ($1,$2,$3,'active') returning *`, [
        nextName,
        now,
        nextEndsAt,
      ])
    ).rows[0];
  });
}

export async function listSeasons(client?: Queryable) {
  return query<Season>(`select * from seasons order by starts_at desc limit 50`, [], client);
}
