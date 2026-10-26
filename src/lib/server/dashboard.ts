import { challengeProgress, dailyChallenges } from "../domain/challenges";
import { addDays, localDate, startOfIsoWeekUtc } from "../domain/dates";
import { levelProgress } from "../domain/scoring";
import { db, query, queryOne } from "./db";
import { dayActivity } from "./game/finish";
import { getUserStandings } from "./rankings";
import type { CurrentUser } from "./session-store";

export async function getDashboard(user: CurrentUser) {
  const tz = user.timezone;
  const now = new Date();
  const today = localDate(now, tz);

  const stats =
    (await queryOne<{
      xp_total: number;
      current_streak: number;
      longest_streak: number;
      last_study_date: Date | null;
      study_seconds: string;
      sessions_count: number;
      answered_total: number;
      correct_total: number;
      best_answer_streak: number;
    }>(`select * from user_stats where user_id = $1`, [user.id])) ?? null;

  const lastStudy = stats?.last_study_date
    ? `${stats.last_study_date.getFullYear()}-${String(stats.last_study_date.getMonth() + 1).padStart(2, "0")}-${String(stats.last_study_date.getDate()).padStart(2, "0")}`
    : null;
  // A sequência só continua se o usuário estudou hoje ou ontem
  const streakAlive = lastStudy === today || lastStudy === addDays(today, -1);

  const languages = await query<{
    code: string;
    name_pt: string;
    flag: string;
    level_code: string;
    last_studied_at: Date | null;
    total: number;
    learned: number;
    due: number;
  }>(
    `select l.code, l.name_pt, l.flag, ul.level_code, ul.last_studied_at,
            (select count(*)::int from content_items i where i.language_code = l.code and i.review_status in ('pending_review','approved')) as total,
            (select count(*)::int from user_item_progress p join content_items i on i.id = p.item_id where p.user_id = $1 and i.language_code = l.code and p.reps >= 2) as learned,
            (select count(*)::int from user_item_progress p join content_items i on i.id = p.item_id where p.user_id = $1 and i.language_code = l.code and p.due_at <= now()) as due
       from user_languages ul join languages l on l.code = ul.language_code
      where ul.user_id = $1
      order by ul.last_studied_at desc nulls last, l.sort_order`,
    [user.id],
  );

  const modes = await query<{ mode: string; sessions: number; best: number; ranked: number; accuracy: number }>(
    `select mode, count(*)::int as sessions, coalesce(max(rank_points), 0)::int as best,
            count(*) filter (where kind = 'ranked')::int as ranked, coalesce(avg(accuracy) filter (where answered_count > 0), 0)::float as accuracy
       from game_sessions where user_id = $1 and status = 'finished' group by mode`,
    [user.id],
  );

  // Evolução: XP por dia nos últimos 14 dias (fuso do usuário)
  const history = await query<{ day: string; xp: number }>(
    `select to_char((created_at at time zone $2)::date, 'YYYY-MM-DD') as day, sum(amount)::int as xp
       from xp_events where user_id = $1 and created_at > now() - interval '15 days'
      group by 1 order by 1`,
    [user.id, tz],
  );
  const historyMap = new Map(history.map((h) => [h.day, h.xp]));
  const xpByDay = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13);
    return { day, xp: historyMap.get(day) ?? 0 };
  });

  const achievements = await query<{ code: string; name_pt: string; icon: string; unlocked_at: Date }>(
    `select a.code, a.name_pt, a.icon, ua.unlocked_at from user_achievements ua join achievements a on a.code = ua.achievement_code
      where ua.user_id = $1 order by ua.unlocked_at desc limit 6`,
    [user.id],
  );
  const achievementTotals = await queryOne<{ unlocked: number; total: number }>(
    `select (select count(*)::int from user_achievements where user_id = $1) as unlocked, (select count(*)::int from achievements) as total`,
    [user.id],
  );

  const activity = await dayActivity(db, user.id, tz, today);
  const completed = new Set(
    (await query<{ code: string }>(`select code from challenge_completions where user_id = $1 and challenge_date = $2`, [user.id, today])).map(
      (r) => r.code,
    ),
  );
  const challenges = dailyChallenges(today).map((def) => ({
    ...def,
    ...challengeProgress(def, activity),
    claimed: completed.has(def.code),
  }));

  const weekXp =
    (await queryOne<{ xp: number }>(`select coalesce(sum(amount), 0)::int as xp from xp_events where user_id = $1 and created_at >= $2`, [
      user.id,
      startOfIsoWeekUtc(now),
    ]))?.xp ?? 0;

  const activeSession = await queryOne<{ id: string; mode: string; preset: string; started_at: Date }>(
    `select id, mode, preset, started_at from game_sessions where user_id = $1 and status = 'active' and expires_at > now()
      order by started_at desc limit 1`,
    [user.id],
  );

  const standings = await getUserStandings(user.id);

  // Recomendações
  const current = languages.find((l) => l.code === user.currentLanguage) ?? languages[0] ?? null;
  const recommendations: { title: string; description: string; href: string }[] = [];
  if (current?.due) {
    recommendations.push({
      title: `Revisar ${current.due} ${current.due === 1 ? "item" : "itens"}`,
      description: "Palavras e frases que estão no momento ideal de revisão.",
      href: `/jogar/digitar?foco=revisao`,
    });
  }
  if (current) {
    const weak = await queryOne<{ category: string; slug: string; unit_id: number }>(
      `select c.name_pt as category, c.slug, min(i.unit_id) as unit_id
         from user_item_progress p join content_items i on i.id = p.item_id join categories c on c.slug = i.category_slug
        where p.user_id = $1 and i.language_code = $2
        group by c.name_pt, c.slug
       having sum(p.wrong_count) > 0
        order by sum(p.wrong_count)::float / greatest(sum(p.correct_count + p.wrong_count), 1) desc limit 1`,
      [user.id, current.code],
    );
    if (weak) {
      recommendations.push({
        title: `Reforçar: ${weak.category}`,
        description: "É o tema com mais erros recentes. Uma sessão focada ajuda a fixar.",
        href: `/jogar/digitar?unidade=${weak.unit_id}`,
      });
    }
  }
  const voicePlayed = modes.find((m) => m.mode === "voice");
  if (!voicePlayed) {
    recommendations.push({ title: "Experimente o Jogo com Vozes", description: "Pratique a pronúncia ouvindo e repetindo frases.", href: "/jogar/voz" });
  }
  if (!modes.find((m) => m.mode === "typing")) {
    recommendations.push({ title: "Comece pelo Jogo de Digitar", description: "Uma sessão rápida de 10 exercícios.", href: "/jogar/digitar" });
  }

  const learnedTotal = languages.reduce((s, l) => s + l.learned, 0);
  const xp = stats?.xp_total ?? 0;
  return {
    today,
    xp,
    level: levelProgress(xp),
    streak: { current: streakAlive ? (stats?.current_streak ?? 0) : 0, longest: stats?.longest_streak ?? 0, studiedToday: lastStudy === today },
    studySeconds: Number(stats?.study_seconds ?? 0),
    sessions: stats?.sessions_count ?? 0,
    accuracy: stats?.answered_total ? stats.correct_total / stats.answered_total : null,
    bestAnswerStreak: stats?.best_answer_streak ?? 0,
    learnedTotal,
    languages,
    currentLanguage: current,
    modes: {
      typing: modes.find((m) => m.mode === "typing") ?? null,
      voice: voicePlayed ?? null,
    },
    xpByDay,
    achievements,
    achievementTotals,
    challenges,
    weekly: { xp: weekXp, goal: user.weeklyGoalXp },
    activeSession,
    standings,
    recommendations: recommendations.slice(0, 3),
  };
}

export async function getHistory(userId: string, page: number, pageSize = 20) {
  const rows = await query<{
    id: string;
    language_code: string;
    flag: string;
    mode: string;
    format: string;
    kind: string;
    preset: string;
    status: string;
    started_at: Date;
    finished_at: Date | null;
    raw_score: number;
    xp_awarded: number;
    rank_points: number;
    answered_count: number;
    accuracy: number;
    end_reason: string | null;
  }>(
    `select s.id, s.language_code, l.flag, s.mode, s.format, s.kind, s.preset, s.status, s.started_at, s.finished_at, s.raw_score,
            s.xp_awarded, s.rank_points, s.answered_count, s.accuracy::float, s.end_reason
       from game_sessions s join languages l on l.code = s.language_code
      where s.user_id = $1
      order by s.started_at desc limit $2 offset $3`,
    [userId, pageSize + 1, (page - 1) * pageSize],
  );
  const records = await queryOne<{ best_typing: number; best_voice: number; best_raw: number; best_streak: number }>(
    `select coalesce(max(rank_points) filter (where mode = 'typing'), 0)::int as best_typing,
            coalesce(max(rank_points) filter (where mode = 'voice'), 0)::int as best_voice,
            coalesce(max(raw_score), 0)::int as best_raw,
            coalesce(max(max_streak), 0)::int as best_streak
       from game_sessions where user_id = $1 and status = 'finished'`,
    [userId],
  );
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, records };
}

export async function getAchievements(userId: string) {
  return query<{ code: string; name_pt: string; description_pt: string; icon: string; xp_reward: number; unlocked_at: Date | null }>(
    `select a.code, a.name_pt, a.description_pt, a.icon, a.xp_reward, ua.unlocked_at
       from achievements a left join user_achievements ua on ua.achievement_code = a.code and ua.user_id = $1
      order by (ua.unlocked_at is null), a.sort_order`,
    [userId],
  );
}
