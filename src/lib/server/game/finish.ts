import type { PoolClient } from "pg";
import { z } from "zod";
import { evaluateAchievements } from "../../domain/achievements";
import { RESULT_CREDIT } from "../../domain/answer-check";
import { challengeProgress, dailyChallenges, type DayActivity } from "../../domain/challenges";
import { addDays, localDate } from "../../domain/dates";
import { ITEM_GRACE_SECONDS } from "../../domain/presets";
import { itemXp, levelFromXp, typingRankPoints, voiceRankPoints, type ScoringRules } from "../../domain/scoring";
import { nextReview, qualityFromTyping, qualityFromVoice } from "../../domain/srs";
import { config } from "../config";
import { tx } from "../db";
import { notFound } from "../errors";
import { ensureActiveSeason } from "../seasons";
import { getScoringRules } from "../settings";
import { awardWeeklyGoalIfReached } from "../study";

export type EndReason = "completed" | "time_up" | "quit" | "replaced" | "expired";

export interface SessionResult {
  sessionId: string;
  mode: string;
  kind: string;
  rawScore: number;
  rankPoints: number;
  rankEligible: boolean;
  rankNote: string | null;
  xp: {
    items: number;
    completionBonus: number;
    achievements: number;
    challenges: number;
    weeklyGoal: number;
    total: number;
  };
  answered: number;
  correct: number;
  partial: number;
  wrong: number;
  accuracy: number;
  maxStreak: number;
  avgSpeed: number;
  studySeconds: number;
  levelBefore: number;
  levelAfter: number;
  achievements: { code: string; name: string; icon: string; xp: number }[];
  challenges: { code: string; title: string; xp: number }[];
  weeklyGoalReached: boolean;
  placementLevel: string | null;
  newRecord: boolean;
  endReason: EndReason;
}

interface FinishItem {
  idx: number;
  item_id: number;
  format: string;
  is_review: boolean;
  result: string | null;
  excluded: boolean;
  score: number | null;
  points: number;
  speed: number | null;
  answered_at: Date | null;
  difficulty: number;
  level_code: string;
}

interface SessionDbRow {
  id: string;
  user_id: string;
  language_code: string;
  mode: "typing" | "voice";
  format: string;
  kind: "ranked" | "practice" | "placement";
  verification: "server" | "client";
  duration_seconds: number | null;
  target_count: number;
  started_at: Date;
  timer_started_at: Date | null;
  expires_at: Date;
  status: string;
  result: unknown;
}

export const finishSchema = z.object({ reason: z.enum(["completed", "time_up", "quit"]).default("completed") });

/**
 * Encerra uma sessão e aplica todos os efeitos (XP, ranking, revisão espaçada, conquistas...).
 * Idempotente: chamadas repetidas (recarregar a página, clique duplo, nova tentativa de rede)
 * devolvem o mesmo resultado sem conceder pontos novamente.
 */
export async function finishSession(userId: string, sessionId: string, reason: EndReason = "completed"): Promise<SessionResult> {
  if (!z.uuid().safeParse(sessionId).success) throw notFound("Sessão não encontrada.");
  const season = await ensureActiveSeason();
  const rules = await getScoringRules();
  return tx(async (client) => {
    const s = (
      await client.query<SessionDbRow>(`select * from game_sessions where id = $1 and user_id = $2 for update`, [sessionId, userId])
    ).rows[0];
    if (!s) throw notFound("Sessão não encontrada.");
    if (s.status === "finished") return s.result as SessionResult;

    // Serializa finalizações do mesmo usuário (estatísticas, conquistas e desafios)
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`finish:${userId}`]);

    const now = new Date();
    const expiredBy = new Date(s.expires_at).getTime() + (s.timer_started_at ? ITEM_GRACE_SECONDS * 1000 : 0);
    const endReason: EndReason = reason === "completed" && now.getTime() > expiredBy && !s.duration_seconds ? "expired" : reason;
    return applyFinish(client, s, rules, season.id, endReason, now);
  });
}

async function applyFinish(
  client: PoolClient,
  s: SessionDbRow,
  rules: ScoringRules,
  seasonId: number,
  endReason: EndReason,
  now: Date,
): Promise<SessionResult> {
  const userId: string = s.user_id;
  const profile = (
    await client.query<{ timezone: string; weekly_goal_xp: number }>(`select timezone, weekly_goal_xp from profiles where user_id = $1`, [userId])
  ).rows[0];
  const statsBefore = (await client.query(`select * from user_stats where user_id = $1 for update`, [userId])).rows[0];
  const levelBefore = levelFromXp(statsBefore?.xp_total ?? 0);

  const items = (
    await client.query<FinishItem>(
      `select si.idx, si.item_id, si.format, si.is_review, si.result, si.excluded, si.score::float as score, si.points,
              si.speed::float as speed, si.answered_at, lv.difficulty::float as difficulty, ci.level_code
         from session_items si join content_items ci on ci.id = si.item_id join levels lv on lv.code = ci.level_code
        where si.session_id = $1 order by si.idx`,
      [s.id],
    )
  ).rows;
  const answered = items.filter((i) => i.result && !i.excluded);
  const rankWeight = Number(
    (
      await client.query<{ w: number }>(
        `select coalesce(avg(lv.rank_weight), 0.7)::float as w from session_items si join content_items ci on ci.id = si.item_id
           join levels lv on lv.code = ci.level_code where si.session_id = $1 and si.result is not null and not si.excluded`,
        [s.id],
      )
    ).rows[0].w,
  );

  // --- Pontuação e precisão ---
  const isVoice = s.mode === "voice";
  const creditOf = (i: FinishItem) => (isVoice ? (i.score ?? 0) / 100 : RESULT_CREDIT[(i.result ?? "wrong") as keyof typeof RESULT_CREDIT]);
  const passed = (i: FinishItem) => (isVoice ? (i.score ?? 0) >= rules.voice.passScore : creditOf(i) > 0);
  let maxStreak = 0;
  let streak = 0;
  for (const i of answered) {
    if (passed(i)) maxStreak = Math.max(maxStreak, ++streak);
    else streak = 0;
  }
  const correct = answered.filter((i) => (isVoice ? passed(i) : i.result === "correct")).length;
  const partial = isVoice ? 0 : answered.filter((i) => i.result === "accent" || i.result === "typo").length;
  const wrong = answered.length - correct - partial;
  const accuracy = answered.length ? answered.reduce((sum, i) => sum + creditOf(i), 0) / answered.length : 0;
  const accepted = answered.filter((i) => !isVoice && creditOf(i) > 0);
  const avgSpeed = accepted.length ? accepted.reduce((sum, i) => sum + (i.speed ?? 0), 0) / accepted.length : 0;
  const rawScore = answered.reduce((sum, i) => sum + i.points, 0);

  const target = s.target_count as number;
  const rankCtx = { answered: answered.length, target, rankWeight };
  let rankPoints = isVoice
    ? voiceRankPoints(answered.map((i) => i.score ?? 0), rankCtx, rules)
    : typingRankPoints(answered.map((i) => ({ credit: creditOf(i), speed: i.speed ?? 0, points: i.points })), rankCtx, rules);
  let rankEligible = s.kind === "ranked";
  let rankNote: string | null = null;
  if (s.kind !== "ranked") rankNote = s.kind === "placement" ? "Teste de nivelamento não conta para o ranking." : "Sessões de prática não contam para o ranking.";
  else if (isVoice && s.verification === "client" && !config.voiceAllowClientRanked) {
    rankEligible = false;
    rankNote = "Avaliação feita apenas pelo navegador não pode ser verificada pelo servidor e não entra no ranking.";
  } else if (answered.length === 0) {
    rankEligible = false;
    rankNote = "Nenhum exercício respondido.";
  }
  if (!rankEligible) rankPoints = 0;

  // --- XP com retorno decrescente para itens repetidos (anti-farming) ---
  const recentRows = (
    await client.query<{ item_id: number; n: number }>(
      `select si.item_id, count(*)::int as n
         from session_items si join game_sessions gs on gs.id = si.session_id
        where gs.user_id = $1 and gs.status = 'finished' and si.answered_at > now() - interval '20 hours'
          and ((gs.mode = 'typing' and si.result in ('correct','accent','typo')) or (gs.mode = 'voice' and si.score >= $2))
          and si.item_id = any($3)
        group by si.item_id`,
      [userId, rules.voice.passScore, answered.map((i) => i.item_id)],
    )
  ).rows;
  const recent = new Map(recentRows.map((r) => [r.item_id, r.n]));
  let itemsXp = 0;
  for (const i of answered) {
    const credit = isVoice ? (passed(i) ? creditOf(i) : 0) : creditOf(i);
    const xp = itemXp(credit, i.difficulty, recent.get(i.item_id) ?? 0, rules);
    if (credit > 0) recent.set(i.item_id, (recent.get(i.item_id) ?? 0) + 1);
    itemsXp += xp;
    await client.query(`update session_items set xp = $3 where session_id = $1 and idx = $2`, [s.id, i.idx, xp]);
  }

  const completed =
    s.duration_seconds != null ? !!s.timer_started_at && answered.length > 0 : answered.length >= Math.ceil(target * 0.8);
  let completionBonus = 0;
  if (completed && accuracy >= 0.5 && s.kind !== "placement") {
    const today = (
      await client.query<{ n: number }>(
        `select count(*)::int as n from game_sessions where user_id = $1 and status = 'finished'
            and finished_at > now() - interval '24 hours' and (result->'xp'->>'completionBonus')::int > 0`,
        [userId],
      )
    ).rows[0].n;
    if (today < rules.xp.completionBonusDailyLimit) completionBonus = rules.xp.completionBonus;
  }
  const sessionXp = itemsXp + completionBonus;

  // --- Revisão espaçada (primeira ocorrência de cada item na sessão) ---
  const seen = new Set<number>();
  for (const i of answered) {
    if (seen.has(i.item_id)) continue;
    seen.add(i.item_id);
    const quality = isVoice ? qualityFromVoice(i.score ?? 0) : qualityFromTyping(i.result!, i.speed ?? 0);
    const prev = (
      await client.query(`select ease::float, interval_days::float, reps, lapses from user_item_progress where user_id = $1 and item_id = $2`, [
        userId,
        i.item_id,
      ])
    ).rows[0];
    const next = nextReview(
      prev ? { ease: prev.ease, intervalDays: prev.interval_days, reps: prev.reps, lapses: prev.lapses } : { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 },
      quality,
      now,
    );
    const ok = quality >= 3;
    await client.query(
      `insert into user_item_progress (user_id, item_id, ease, interval_days, reps, lapses, correct_count, wrong_count, last_result, last_seen_at, due_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10)
       on conflict (user_id, item_id) do update set ease = excluded.ease, interval_days = excluded.interval_days, reps = excluded.reps,
         lapses = excluded.lapses, correct_count = user_item_progress.correct_count + excluded.correct_count,
         wrong_count = user_item_progress.wrong_count + excluded.wrong_count, last_result = excluded.last_result,
         last_seen_at = now(), due_at = excluded.due_at`,
      [userId, i.item_id, next.ease, next.intervalDays, next.reps, next.lapses, ok ? 1 : 0, ok ? 0 : 1, i.result, next.dueAt],
    );
  }

  // --- Teste de nivelamento ---
  let placementLevel: string | null = null;
  if (s.kind === "placement" && answered.length) {
    const order = ["A1", "A2", "B1", "B2"];
    placementLevel = "A1";
    for (const lvl of order) {
      const ofLevel = answered.filter((i) => i.level_code === lvl);
      if (!ofLevel.length) break;
      const acc = ofLevel.reduce((sum, i) => sum + creditOf(i), 0) / ofLevel.length;
      if (acc >= 0.6) placementLevel = lvl;
      else break;
    }
    await client.query(
      `update user_languages set level_code = $3, placement_level = $3 where user_id = $1 and language_code = $2`,
      [userId, s.language_code, placementLevel],
    );
  }

  // --- Sessão e estatísticas ---
  const startedMs = new Date(s.timer_started_at ?? s.started_at).getTime();
  const cap = s.duration_seconds ? s.duration_seconds + ITEM_GRACE_SECONDS : 30 * 60;
  const lastAnswer = answered.reduce((m, i) => Math.max(m, i.answered_at ? new Date(i.answered_at).getTime() : 0), 0);
  const studySeconds = answered.length ? Math.max(0, Math.min(cap, Math.round((Math.max(lastAnswer, startedMs) - startedMs) / 1000))) : 0;

  const prevBest = (
    await client.query<{ best: number }>(
      `select coalesce(max(rank_points), 0)::int as best from game_sessions where user_id = $1 and mode = $2 and status = 'finished'`,
      [userId, s.mode],
    )
  ).rows[0].best;

  const tz = profile?.timezone ?? "America/Sao_Paulo";
  const today = localDate(now, tz);
  let currentStreak = statsBefore?.current_streak ?? 0;
  if (answered.length) {
    const last = statsBefore?.last_study_date ? localDateFromDb(statsBefore.last_study_date) : null;
    if (last !== today) currentStreak = last === addDays(today, -1) ? currentStreak + 1 : 1;
  }

  await client.query(
    `update game_sessions set status = 'finished', finished_at = $2, end_reason = $3, raw_score = $4, xp_awarded = $5, rank_points = $6,
            answered_count = $7, correct_count = $8, partial_count = $9, wrong_count = $10, max_streak = $11, accuracy = $12,
            avg_speed = $13, study_seconds = $14, season_id = $15
      where id = $1`,
    [s.id, now, endReason, rawScore, sessionXp, rankPoints, answered.length, correct, partial, wrong, maxStreak, accuracy, avgSpeed, studySeconds, rankEligible ? seasonId : null],
  );
  await client.query(`insert into xp_events (user_id, source, ref, amount) values ($1,'session',$2,$3) on conflict do nothing`, [userId, s.id, sessionXp]);

  if (answered.length) {
    await client.query(
      `update user_stats set current_streak = $2, longest_streak = greatest(longest_streak, $2), last_study_date = $3,
              study_seconds = study_seconds + $4, sessions_count = sessions_count + 1, answered_total = answered_total + $5,
              correct_total = correct_total + $6, best_answer_streak = greatest(best_answer_streak, $7), updated_at = now()
        where user_id = $1`,
      [userId, currentStreak, today, studySeconds, answered.length, correct + partial, maxStreak],
    );
    await client.query(`update user_languages set last_studied_at = now() where user_id = $1 and language_code = $2`, [userId, s.language_code]);
  }

  // --- Conquistas ---
  const agg = (
    await client.query<{ sessions: number; modes: string[]; langs: number; learned: number }>(
      `select (select sessions_count from user_stats where user_id = $1) as sessions,
              (select coalesce(array_agg(distinct mode), '{}') from game_sessions where user_id = $1 and status = 'finished' and answered_count > 0) as modes,
              (select count(distinct language_code)::int from game_sessions where user_id = $1 and status = 'finished' and answered_count > 0) as langs,
              (select count(*)::int from user_item_progress where user_id = $1 and reps >= 2) as learned`,
      [userId],
    )
  ).rows[0];
  const unlockedRows = (await client.query<{ achievement_code: string }>(`select achievement_code from user_achievements where user_id = $1`, [userId])).rows;
  const xpBeforeExtras = (statsBefore?.xp_total ?? 0) + sessionXp;
  const newCodes = answered.length
    ? evaluateAchievements(
        {
          sessionsCount: agg.sessions,
          currentStreak,
          level: levelFromXp(xpBeforeExtras),
          learnedItems: agg.learned,
          modesPlayed: new Set(agg.modes),
          languagesPlayed: agg.langs,
          session: { mode: s.mode, kind: s.kind, answered: answered.length, accuracy, maxStreak, avgSpeed },
        },
        new Set(unlockedRows.map((r) => r.achievement_code)),
      )
    : [];
  const achievements: SessionResult["achievements"] = [];
  for (const code of newCodes) {
    const def = (await client.query(`select code, name_pt, icon, xp_reward from achievements where code = $1`, [code])).rows[0];
    if (!def) continue;
    const ins = await client.query(
      `insert into user_achievements (user_id, achievement_code, session_id) values ($1,$2,$3) on conflict do nothing`,
      [userId, code, s.id],
    );
    if (!ins.rowCount) continue;
    await client.query(`insert into xp_events (user_id, source, ref, amount) values ($1,'achievement',$2,$3) on conflict do nothing`, [
      userId,
      code,
      def.xp_reward,
    ]);
    achievements.push({ code, name: def.name_pt, icon: def.icon, xp: def.xp_reward });
  }
  const achievementsXp = achievements.reduce((sum, a) => sum + a.xp, 0);

  // --- Desafios diários ---
  const activity = await dayActivity(client, userId, tz, today);
  const challenges: SessionResult["challenges"] = [];
  for (const def of dailyChallenges(today)) {
    if (!challengeProgress(def, activity).done) continue;
    const ins = await client.query(
      `insert into challenge_completions (user_id, challenge_date, code, xp) values ($1,$2,$3,$4) on conflict do nothing`,
      [userId, today, def.code, def.xp],
    );
    if (!ins.rowCount) continue;
    await client.query(`insert into xp_events (user_id, source, ref, amount) values ($1,'challenge',$2,$3) on conflict do nothing`, [
      userId,
      `${today}:${def.code}`,
      def.xp,
    ]);
    challenges.push({ code: def.code, title: def.title, xp: def.xp });
  }
  const challengesXp = challenges.reduce((sum, c) => sum + c.xp, 0);

  // --- Meta semanal ---
  const weeklyGoalXp = await awardWeeklyGoalIfReached(client, userId, now);

  const totalXp = sessionXp + achievementsXp + challengesXp + weeklyGoalXp;
  const xpAfter = (statsBefore?.xp_total ?? 0) + totalXp;
  const levelAfter = levelFromXp(xpAfter);
  await client.query(`update user_stats set xp_total = $2, level = $3, updated_at = now() where user_id = $1`, [userId, xpAfter, levelAfter]);

  const result: SessionResult = {
    sessionId: s.id,
    mode: s.mode,
    kind: s.kind,
    rawScore,
    rankPoints,
    rankEligible,
    rankNote,
    xp: { items: itemsXp, completionBonus, achievements: achievementsXp, challenges: challengesXp, weeklyGoal: weeklyGoalXp, total: totalXp },
    answered: answered.length,
    correct,
    partial,
    wrong,
    accuracy: Math.round(accuracy * 10000) / 10000,
    maxStreak,
    avgSpeed: Math.round(avgSpeed * 10000) / 10000,
    studySeconds,
    levelBefore,
    levelAfter,
    achievements,
    challenges,
    weeklyGoalReached: weeklyGoalXp > 0,
    placementLevel,
    newRecord: rankEligible && rankPoints > prevBest && prevBest > 0,
    endReason,
  };
  await client.query(`update game_sessions set result = $2 where id = $1`, [s.id, JSON.stringify(result)]);
  return result;
}

function localDateFromDb(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  // colunas "date" chegam como Date à meia-noite local do processo
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Atividade do dia local do usuário (para desafios diários). */
export async function dayActivity(client: Pick<PoolClient, "query">, userId: string, tz: string, day: string): Promise<DayActivity> {
  const r = (
    await client.query(
      `select count(*) filter (where answered_count > 0)::int as sessions,
              count(*) filter (where answered_count > 0 and mode = 'typing')::int as typing,
              count(*) filter (where answered_count > 0 and mode = 'voice')::int as voice,
              count(*) filter (where answered_count > 0 and format = 'listen')::int as listen,
              coalesce(sum(correct_count + partial_count), 0)::int as correct,
              coalesce(max(max_streak), 0)::int as best_streak,
              coalesce(array_agg(id), '{}') as ids
         from game_sessions
        where user_id = $1 and status = 'finished' and (finished_at at time zone $2)::date = $3::date`,
      [userId, tz, day],
    )
  ).rows[0];
  const reviews = (
    await client.query<{ n: number }>(
      `select count(*)::int as n from session_items where session_id = any($1) and is_review and result is not null and not excluded`,
      [r.ids],
    )
  ).rows[0].n;
  return {
    sessions: r.sessions,
    typingSessions: r.typing,
    voiceSessions: r.voice,
    listenSessions: r.listen,
    correct: r.correct,
    reviews,
    bestStreak: r.best_streak,
  };
}
