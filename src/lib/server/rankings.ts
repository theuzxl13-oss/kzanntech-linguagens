import { z } from "zod";
import { startOfIsoWeekUtc } from "../domain/dates";
import { leagueFor, type ScoringRules } from "../domain/scoring";
import { query, queryOne } from "./db";
import { ensureActiveSeason } from "./seasons";
import { getScoringRules } from "./settings";

export const rankingQuerySchema = z.object({
  board: z.enum(["typing", "voice", "general"]).default("general"),
  period: z.enum(["week", "season", "all"]).default("season"),
  language: z
    .string()
    .regex(/^[a-z]{2,3}$/)
    .nullable()
    .optional(),
  seasonId: z.coerce.number().int().positive().optional(),
});

export type RankingQuery = z.infer<typeof rankingQuerySchema>;

export interface RankingRow {
  position: number;
  userId: string;
  nickname: string;
  avatar: string;
  avatarColor: string;
  isDemo: boolean;
  points: number;
  typing: number;
  voice: number;
  general: number;
  sessions: number;
  unverified: boolean;
  league: { code: string; name: string } | null;
  change: number | "new" | null;
}

export interface Ranking {
  board: RankingQuery["board"];
  period: RankingQuery["period"];
  language: string | null;
  range: { from: Date | null; to: Date | null };
  seasonName: string | null;
  frozen: boolean;
  rows: RankingRow[];
  viewer: RankingRow | null;
  totalPlayers: number;
  rules: { topSessions: number; leagues: ScoringRules["leagues"] };
}

interface Standing {
  user_id: string;
  nickname: string;
  avatar: string;
  avatar_color: string;
  is_demo: boolean;
  typing: number;
  voice: number;
  general: number;
  sessions: number;
  unverified: boolean;
}

/**
 * Placar de cada usuário no intervalo: soma das N melhores sessões ranqueadas por modalidade
 * (N = rules.ranking.topSessions) e ranking geral = média dos dois placares.
 */
async function standings(from: Date | null, to: Date, language: string | null, topN: number): Promise<Standing[]> {
  return query<Standing>(
    `with eligible as (
       select s.user_id, s.mode, s.rank_points, s.verification,
              row_number() over (partition by s.user_id, s.mode order by s.rank_points desc, s.finished_at) as rn
         from game_sessions s
         join users u on u.id = s.user_id and u.status = 'active'
         join profiles p on p.user_id = s.user_id and p.show_in_rankings
        where s.status = 'finished' and s.kind = 'ranked' and s.rank_points > 0
          and s.finished_at < $2 and ($1::timestamptz is null or s.finished_at >= $1)
          and ($3::text is null or s.language_code = $3)
     ), top as (
       select * from eligible where rn <= $4
     )
     select t.user_id, p.nickname, p.avatar, p.avatar_color, p.is_demo,
            coalesce(sum(t.rank_points) filter (where t.mode = 'typing'), 0)::int as typing,
            coalesce(sum(t.rank_points) filter (where t.mode = 'voice'), 0)::int as voice,
            round((coalesce(sum(t.rank_points) filter (where t.mode = 'typing'), 0)
                 + coalesce(sum(t.rank_points) filter (where t.mode = 'voice'), 0)) / 2.0)::int as general,
            count(*)::int as sessions,
            bool_or(t.mode = 'voice' and t.verification = 'client') as unverified
       from top t join profiles p on p.user_id = t.user_id
      group by t.user_id, p.nickname, p.avatar, p.avatar_color, p.is_demo`,
    [from, to, language, topN],
  );
}

function rank(list: Standing[], board: RankingQuery["board"]) {
  const sorted = list.filter((s) => s[board] > 0).sort((a, b) => b[board] - a[board] || a.nickname.localeCompare(b.nickname));
  const positions = new Map<string, number>();
  let pos = 0;
  let prev = -1;
  sorted.forEach((s, i) => {
    if (s[board] !== prev) pos = i + 1;
    prev = s[board];
    positions.set(s.user_id, pos);
  });
  return { sorted, positions };
}

export async function getRanking(q: RankingQuery, viewerId: string | null, limit = 50): Promise<Ranking> {
  const rules = await getScoringRules();
  const now = new Date();
  const language = q.language ?? null;

  // Temporada encerrada: lê o histórico congelado
  if (q.seasonId) {
    const season = await queryOne<{ id: number; name: string; starts_at: Date; ends_at: Date; status: string }>(
      `select * from seasons where id = $1`,
      [q.seasonId],
    );
    if (season && season.status === "closed") return frozenRanking(q, season, viewerId, limit, rules);
  }

  let from: Date | null = null;
  let to = now;
  let seasonName: string | null = null;
  const season = await ensureActiveSeason(now);
  if (q.period === "week") from = startOfIsoWeekUtc(now);
  if (q.period === "season") {
    from = new Date(season.starts_at);
    to = new Date(Math.min(now.getTime(), new Date(season.ends_at).getTime()));
    seasonName = season.name;
  }

  const current = rank(await standings(from, to, language, rules.ranking.topSessions), q.board);
  // Evolução: posição no início do dia (UTC) comparada com a atual
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const before = from && startOfDay <= from ? null : rank(await standings(from, startOfDay, language, rules.ranking.topSessions), q.board);

  // Ligas usam o placar geral da temporada atual
  const seasonGeneral =
    q.period === "season" && q.board === "general"
      ? null
      : new Map(
          (await standings(new Date(season.starts_at), now, language, rules.ranking.topSessions)).map((s) => [s.user_id, s.general]),
        );

  const toRow = (s: Standing): RankingRow => {
    const position = current.positions.get(s.user_id)!;
    const prevPos = before?.positions.get(s.user_id);
    const leaguePts = seasonGeneral ? (seasonGeneral.get(s.user_id) ?? 0) : s.general;
    const league = leagueFor(leaguePts, rules);
    return {
      position,
      userId: s.user_id,
      nickname: s.nickname,
      avatar: s.avatar,
      avatarColor: s.avatar_color,
      isDemo: s.is_demo,
      points: s[q.board],
      typing: s.typing,
      voice: s.voice,
      general: s.general,
      sessions: s.sessions,
      unverified: s.unverified,
      league: { code: league.code, name: league.name },
      change: before ? (prevPos ? prevPos - position : "new") : null,
    };
  };

  const rows = current.sorted.slice(0, limit).map(toRow);
  const viewerStanding = viewerId ? current.sorted.find((s) => s.user_id === viewerId) : undefined;
  return {
    board: q.board,
    period: q.period,
    language,
    range: { from, to },
    seasonName,
    frozen: false,
    rows,
    viewer: viewerStanding ? toRow(viewerStanding) : null,
    totalPlayers: current.sorted.length,
    rules: { topSessions: rules.ranking.topSessions, leagues: rules.leagues },
  };
}

async function frozenRanking(
  q: RankingQuery,
  season: { id: number; name: string; starts_at: Date; ends_at: Date },
  viewerId: string | null,
  limit: number,
  rules: ScoringRules,
): Promise<Ranking> {
  const rows = await query<{
    user_id: string;
    nickname: string;
    avatar: string;
    avatar_color: string;
    is_demo: boolean;
    points: number;
    position: number;
    league: string;
  }>(
    `select r.user_id, p.nickname, p.avatar, p.avatar_color, p.is_demo, r.points, r.position, r.league
       from season_results r join profiles p on p.user_id = r.user_id
      where r.season_id = $1 and r.board = $2 and r.language_code = $3
      order by r.position, p.nickname`,
    [season.id, q.board, q.language ?? "*"],
  );
  const toRow = (r: (typeof rows)[number]): RankingRow => {
    const l = rules.leagues.find((x) => x.code === r.league);
    return {
      position: r.position,
      userId: r.user_id,
      nickname: r.nickname,
      avatar: r.avatar,
      avatarColor: r.avatar_color,
      isDemo: r.is_demo,
      points: r.points,
      typing: q.board === "typing" ? r.points : 0,
      voice: q.board === "voice" ? r.points : 0,
      general: q.board === "general" ? r.points : 0,
      sessions: 0,
      unverified: false,
      league: l ? { code: l.code, name: l.name } : null,
      change: null,
    };
  };
  const viewer = viewerId ? rows.find((r) => r.user_id === viewerId) : undefined;
  return {
    board: q.board,
    period: "season",
    language: q.language ?? null,
    range: { from: season.starts_at, to: season.ends_at },
    seasonName: season.name,
    frozen: true,
    rows: rows.slice(0, limit).map(toRow),
    viewer: viewer ? toRow(viewer) : null,
    totalPlayers: rows.length,
    rules: { topSessions: rules.ranking.topSessions, leagues: rules.leagues },
  };
}

/** Posições do usuário nos três rankings da temporada atual (dashboard). */
export async function getUserStandings(userId: string) {
  const [general, typing, voice] = await Promise.all(
    (["general", "typing", "voice"] as const).map((board) => getRanking({ board, period: "season" }, userId, 0)),
  );
  const rules = await getScoringRules();
  const gPts = general.viewer?.general ?? 0;
  const league = leagueFor(gPts, rules);
  return {
    seasonName: general.seasonName,
    general: general.viewer ? { position: general.viewer.position, points: general.viewer.points, of: general.totalPlayers } : null,
    typing: typing.viewer ? { position: typing.viewer.position, points: typing.viewer.points, of: typing.totalPlayers } : null,
    voice: voice.viewer ? { position: voice.viewer.position, points: voice.viewer.points, of: voice.totalPlayers } : null,
    league: { code: league.code, name: league.name, points: gPts, next: league.next ? { name: league.next.name, min: league.next.min } : null },
  };
}
