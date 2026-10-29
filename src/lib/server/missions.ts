/**
 * Missões de diálogo. Todo o estado (etapa atual, tentativas, dicas, pontuação, XP) fica no servidor.
 * O navegador só envia o texto digitado; a avaliação, a pontuação e as recompensas são calculadas aqui.
 */
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  MAX_ANSWER_LENGTH,
  MAX_TRIES_PER_STEP,
  MISSION_XP,
  evaluateStep,
  hintText,
  missionStatus,
  missionXp,
  REGIONS,
  stepScore,
  type MissionSpec,
  type MissionStatus,
} from "../domain/missions";
import { PLAYABLE_STATUSES } from "./content";
import { query, queryOne, tx } from "./db";
import { conflict, notFound } from "./errors";
import { enforceRateLimit } from "./rate-limit";
import { applyStudyDay, userToday } from "./study";

export const answerMissionSchema = z.object({
  step: z.number().int().min(0).max(50),
  tryNo: z.number().int().min(1).max(MAX_TRIES_PER_STEP),
  text: z.string().max(MAX_ANSWER_LENGTH * 2),
});
export const hintMissionSchema = z.object({ step: z.number().int().min(0).max(50) });

interface MissionRow {
  id: string;
  language_code: string;
  region: string;
  level_code: string;
  title: string;
  sort_order: number;
  requires_mission: string | null;
  requires_lessons: number;
  spec: MissionSpec;
  review_status: string;
}

interface AttemptRow {
  id: string;
  user_id: string;
  mission_id: string;
  status: "in_progress" | "completed" | "abandoned";
  current_step: number;
  hints: (number | null)[];
  summary: MissionSummary | null;
}

export interface MissionAnswerResponse {
  passed: boolean;
  feedback: string[];
  missing: string[];
  grammar: { explanationPt: string; correction: string }[];
  bonusMissing: string[];
  reply: { text: string; pt: string } | null;
  model: string | null;
  triesLeft: number;
  advanced: boolean;
  finished: boolean;
  summary: MissionSummary | null;
  /** true quando a mesma resposta já tinha sido registrada (reenvio). */
  replayed: boolean;
}

export interface MissionSummary {
  score: number;
  xp: number;
  firstCompletion: boolean;
  learnedPt: string;
  wellDone: string[];
  corrections: { goalPt: string; answer: string; notes: string[]; model: string }[];
  practice: { phrase: string; goalPt: string } | null;
  reviewScheduled: number;
  next: { id: string; title: string } | null;
}

async function lessonsDone(userId: string, language: string, client?: PoolClient) {
  const r = await query<{ n: number }>(
    `select count(*)::int as n from user_lessons ul join units u on u.id = ul.unit_id where ul.user_id = $1 and u.language_code = $2`,
    [userId, language],
    client,
  );
  return r[0]?.n ?? 0;
}

async function completedMissions(userId: string, client?: PoolClient) {
  const rows = await query<{ mission_id: string }>(`select distinct mission_id from mission_attempts where user_id = $1 and status = 'completed'`, [userId], client);
  return new Set(rows.map((r) => r.mission_id));
}

function unlockOf(m: MissionRow) {
  return { id: m.id, requiresMission: m.requires_mission, requiresLessons: m.requires_lessons };
}

export async function listMissions(userId: string, language: string) {
  const [missions, done, lessons, open, best] = await Promise.all([
    query<MissionRow>(`select * from missions where language_code = $1 and review_status = any($2) order by region, sort_order, id`, [language, PLAYABLE_STATUSES]),
    completedMissions(userId),
    lessonsDone(userId, language),
    query<{ mission_id: string; id: string; current_step: number }>(`select mission_id, id, current_step from mission_attempts where user_id = $1 and status = 'in_progress'`, [userId]),
    query<{ mission_id: string; best: number }>(
      `select mission_id, max(score)::float as best from mission_attempts where user_id = $1 and status = 'completed' group by mission_id`,
      [userId],
    ),
  ]);
  const openBy = new Map(open.map((o) => [o.mission_id, o]));
  const bestBy = new Map(best.map((b) => [b.mission_id, b.best]));
  const items = missions.map((m) => {
    const status: MissionStatus = missionStatus(unlockOf(m), done, lessons);
    const req = m.requires_mission ? missions.find((x) => x.id === m.requires_mission) : null;
    return {
      id: m.id,
      title: m.title,
      region: m.region,
      level: m.level_code,
      characterName: m.spec.characterName,
      contextPt: m.spec.contextPt,
      objectivePt: m.spec.objectivePt,
      steps: m.spec.steps.length,
      status,
      reviewed: m.review_status === "approved",
      bestScore: bestBy.get(m.id) ?? null,
      inProgress: openBy.has(m.id) ? { attemptId: openBy.get(m.id)!.id, step: openBy.get(m.id)!.current_step } : null,
      unlockHint:
        status === "locked"
          ? [req && !done.has(req.id) ? `conclua a missão "${req.title}"` : null, lessons < m.requires_lessons ? `conclua ${m.requires_lessons} lição(ões) da trilha (${lessons} até agora)` : null]
              .filter(Boolean)
              .join(" e ")
          : null,
    };
  });
  const regions = [...new Set(items.map((i) => i.region))].map((code) => ({
    code,
    ...(REGIONS[code] ?? { name: code, icon: "🗺️", description: "" }),
    missions: items.filter((i) => i.region === code),
  }));
  return { regions, lessonsDone: lessons };
}

async function loadMission(id: string, client?: PoolClient) {
  return queryOne<MissionRow>(`select * from missions where id = $1 and review_status = any($2)`, [id, PLAYABLE_STATUSES], client);
}

/** Inicia (ou retoma) uma missão. Missões concluídas podem ser repetidas para praticar. */
export async function startMission(userId: string, missionId: string) {
  await enforceRateLimit(`mission-start:${userId}`, 60, 3600);
  if (!/^[a-z]{2,3}-[a-z0-9-]{2,40}$/.test(missionId)) throw notFound("Missão não encontrada.");
  const m = await loadMission(missionId);
  if (!m) throw notFound("Missão não encontrada.");
  const status = missionStatus(unlockOf(m), await completedMissions(userId), await lessonsDone(userId, m.language_code));
  if (status === "locked") throw conflict("mission_locked", "Esta missão ainda está bloqueada.");
  const created = await queryOne<{ id: string }>(
    `insert into mission_attempts (user_id, mission_id) values ($1,$2)
     on conflict (user_id, mission_id) where status = 'in_progress' do nothing returning id`,
    [userId, missionId],
  );
  const id =
    created?.id ??
    (await queryOne<{ id: string }>(`select id from mission_attempts where user_id = $1 and mission_id = $2 and status = 'in_progress'`, [userId, missionId]))!.id;
  return { attemptId: id };
}

function hintLevel(a: Pick<AttemptRow, "hints">, step: number) {
  return a.hints?.[step] ?? 0;
}

/** Visão da tentativa para o jogador: nunca revela as respostas aceitas nem a resposta-modelo antes da dica 3. */
export async function getAttemptView(userId: string, attemptId: string) {
  if (!z.uuid().safeParse(attemptId).success) return null;
  const a = await queryOne<AttemptRow>(`select * from mission_attempts where id = $1 and user_id = $2`, [attemptId, userId]);
  if (!a) return null;
  const m = await queryOne<MissionRow>(`select * from missions where id = $1`, [a.mission_id]);
  if (!m) return null;
  const turns = await query<{ step_idx: number; try_no: number; answer_text: string; passed: boolean; evaluation: { feedback: string[] } }>(
    `select step_idx, try_no, answer_text, passed, evaluation from mission_turns where attempt_id = $1 order by step_idx, try_no`,
    [attemptId],
  );
  const spec = m.spec;
  const transcript = spec.steps.slice(0, Math.min(a.current_step + 1, spec.steps.length)).map((s, i) => {
    const stepTurns = turns.filter((t) => t.step_idx === i);
    const done = i < a.current_step;
    const passed = stepTurns.some((t) => t.passed);
    return {
      npc: s.npc,
      npcPt: s.npcPt,
      turns: stepTurns.map((t) => ({ text: t.answer_text, passed: t.passed, feedback: t.evaluation.feedback })),
      reply: done && passed ? { text: s.reply, pt: s.replyPt } : null,
      model: done && !passed ? s.model : null,
    };
  });
  const cur = a.status === "in_progress" ? spec.steps[a.current_step] : null;
  const level = cur ? hintLevel(a, a.current_step) : 0;
  return {
    attemptId: a.id,
    status: a.status,
    mission: {
      id: m.id,
      title: m.title,
      level: m.level_code,
      language: m.language_code,
      characterName: spec.characterName,
      characterRole: spec.characterRole,
      contextPt: spec.contextPt,
      objectivePt: spec.objectivePt,
      structures: spec.structures,
      totalSteps: spec.steps.length,
      reviewed: m.review_status === "approved",
    },
    transcript,
    current: cur
      ? {
          step: a.current_step,
          goalPt: cur.goalPt,
          tryNo: transcript[a.current_step].turns.length + 1,
          hintLevel: level,
          hints: [1, 2, 3].filter((l) => l <= level).map((l) => hintText(cur, l)),
        }
      : null,
    summary: a.summary,
  };
}

async function lockAttempt(client: PoolClient, userId: string, attemptId: string) {
  if (!z.uuid().safeParse(attemptId).success) throw notFound("Missão não encontrada.");
  const a = (await client.query<AttemptRow>(`select * from mission_attempts where id = $1 and user_id = $2 for update`, [attemptId, userId])).rows[0];
  if (!a) throw notFound("Missão não encontrada.");
  const m = (await client.query<MissionRow>(`select * from missions where id = $1`, [a.mission_id])).rows[0];
  if (!m) throw notFound("Missão não encontrada.");
  return { a, m };
}

export async function hintMission(userId: string, attemptId: string, step: number) {
  await enforceRateLimit(`mission-hint:${userId}`, 120, 3600);
  return tx(async (client) => {
    const { a, m } = await lockAttempt(client, userId, attemptId);
    if (a.status !== "in_progress") throw conflict("mission_finished", "Esta missão já terminou.");
    if (step !== a.current_step) throw conflict("step_mismatch", "Etapa fora de sequência. Recarregue a missão.");
    const level = Math.min(3, hintLevel(a, step) + 1);
    // Reconstrói o array a partir do índice 1 (atribuir hints[n] num array vazio criaria limites fora do padrão)
    await client.query(
      `update mission_attempts set hints = (
         select array_agg(case when i = $2 then $3 else coalesce(hints[i], 0) end order by i)
           from generate_series(1, greatest($2, coalesce(array_length(hints, 1), 0))) as i)
       where id = $1`,
      [a.id, step + 1, level],
    );
    const s = m.spec.steps[step];
    return { level, hints: [1, 2, 3].filter((l) => l <= level).map((l) => hintText(s, l)) };
  });
}

/**
 * Resposta a uma etapa. Idempotente por (tentativa, etapa, número da tentativa): reenviar a mesma
 * requisição devolve o resultado gravado, sem contar de novo.
 */
export async function answerMission(userId: string, attemptId: string, input: z.infer<typeof answerMissionSchema>): Promise<MissionAnswerResponse> {
  await enforceRateLimit(`mission-answer:${userId}`, 60, 60);
  return tx(async (client) => {
    const { a, m } = await lockAttempt(client, userId, attemptId);
    const replay = (
      await client.query<{ evaluation: { response: MissionAnswerResponse } }>(`select evaluation from mission_turns where attempt_id = $1 and step_idx = $2 and try_no = $3`, [
        a.id,
        input.step,
        input.tryNo,
      ])
    ).rows[0];
    if (replay) return { ...replay.evaluation.response, replayed: true };
    if (a.status !== "in_progress") throw conflict("mission_finished", "Esta missão já terminou.");
    if (input.step !== a.current_step) throw conflict("step_mismatch", "Etapa fora de sequência. Recarregue a missão.");
    const prevTries = Number(
      (await client.query<{ n: number }>(`select count(*)::int as n from mission_turns where attempt_id = $1 and step_idx = $2`, [a.id, input.step])).rows[0].n,
    );
    if (input.tryNo !== prevTries + 1) throw conflict("attempt_mismatch", "Tentativa fora de sequência. Recarregue a missão.");

    const spec = m.spec;
    const s = spec.steps[input.step];
    const text = input.text.trim().slice(0, MAX_ANSWER_LENGTH);
    const ev = evaluateStep(s, text, m.language_code);
    const outOfTries = !ev.passed && input.tryNo >= MAX_TRIES_PER_STEP;
    const advance = ev.passed || outOfTries;
    const nextStep = advance ? input.step + 1 : input.step;
    const finished = nextStep >= spec.steps.length;
    if (advance) await client.query(`update mission_attempts set current_step = $2 where id = $1`, [a.id, nextStep]);

    const base = { feedback: ev.feedback, missing: ev.missing, grammar: ev.grammar, found: ev.found };
    const turn = await client.query<{ id: number }>(
      `insert into mission_turns (attempt_id, step_idx, try_no, answer_text, passed, evaluation) values ($1,$2,$3,$4,$5,$6) returning id`,
      [a.id, input.step, input.tryNo, text, ev.passed, JSON.stringify(base)],
    );
    const summary = finished ? await finalize(client, userId, a, m) : null;
    const response: MissionAnswerResponse = {
      passed: ev.passed,
      feedback: ev.feedback,
      missing: ev.missing,
      grammar: ev.grammar,
      bonusMissing: ev.bonusMissing,
      reply: ev.passed ? { text: s.reply, pt: s.replyPt } : null,
      model: outOfTries ? s.model : null,
      triesLeft: advance ? 0 : MAX_TRIES_PER_STEP - input.tryNo,
      advanced: advance,
      finished,
      summary,
      replayed: false,
    };
    // Guarda a resposta completa para devolver igual em reenvios (idempotência)
    await client.query(`update mission_turns set evaluation = $2 where id = $1`, [turn.rows[0].id, JSON.stringify({ ...base, response })]);
    return response;
  });
}

/** Encerra a tentativa: pontuação, XP (com teto), sequência, revisão espaçada e resumo pedagógico. */
async function finalize(client: PoolClient, userId: string, a: AttemptRow, m: MissionRow): Promise<MissionSummary> {
  // Serializa com outras finalizações do mesmo usuário (XP e sequência)
  await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`finish:${userId}`]);
  const spec = m.spec;
  const hints = (await client.query<{ hints: (number | null)[] }>(`select hints from mission_attempts where id = $1`, [a.id])).rows[0].hints;
  const turns = (
    await client.query<{ step_idx: number; try_no: number; answer_text: string; passed: boolean; evaluation: { feedback: string[]; grammar: unknown[] } }>(
      `select step_idx, try_no, answer_text, passed, evaluation from mission_turns where attempt_id = $1 order by step_idx, try_no`,
      [a.id],
    )
  ).rows;

  const steps = spec.steps.map((s, i) => {
    const ts = turns.filter((t) => t.step_idx === i);
    const passed = ts.some((t) => t.passed);
    const level = hints?.[i] ?? 0;
    const grammarIssue = ts.some((t) => t.passed && t.evaluation.grammar?.length);
    const score = stepScore(passed, ts.length, level, grammarIssue);
    const last = ts[ts.length - 1];
    const notes = [...new Set(ts.flatMap((t) => t.evaluation.feedback).filter((f) => !/^Mensagem entendida|^Ainda falta|^Escreva uma resposta/.test(f)))];
    return { s, passed, score, level, last, notes };
  });
  const score = Math.round((steps.reduce((acc, x) => acc + x.score, 0) / steps.length) * 1000) / 1000;

  const firstCompletion = !(
    await client.query(`select 1 from mission_attempts where user_id = $1 and mission_id = $2 and status = 'completed' and id <> $3`, [userId, m.id, a.id])
  ).rowCount;
  const today = await userToday(client, userId);
  const last24 = (
    await client.query<{ xp: number }>(
      `select coalesce(sum(amount), 0)::int as xp from xp_events where user_id = $1 and source = 'mission' and created_at > now() - interval '24 hours'`,
      [userId],
    )
  ).rows[0].xp;
  const amount = missionXp(score, firstCompletion, last24);
  const ref = firstCompletion ? m.id : `${m.id}:${today}`;
  const ins = amount > 0 ? await client.query(`insert into xp_events (user_id, source, ref, amount) values ($1,'mission',$2,$3) on conflict do nothing`, [userId, ref, amount]) : null;
  const xp = ins?.rowCount ? amount : 0;
  await applyStudyDay(client, userId, xp, today);
  await client.query(`update user_languages set last_studied_at = now() where user_id = $1 and language_code = $2`, [userId, m.language_code]);

  // Revisão espaçada: com desempenho fraco, o vocabulário da missão volta para revisão agora;
  // caso contrário, entra (se ainda não estiver) com a primeira revisão amanhã.
  const weak = steps.some((x) => x.score < 0.7);
  const vocabIds = (
    await client.query<{ id: number }>(
      `select id from content_items where language_code = $1 and lower(text) = any($2) and review_status = any($3)`,
      [m.language_code, spec.vocab.map((v) => v.toLowerCase()), PLAYABLE_STATUSES],
    )
  ).rows.map((r) => r.id);
  let reviewScheduled = 0;
  if (vocabIds.length) {
    const r = weak
      ? await client.query(
          `insert into user_item_progress (user_id, item_id, last_result, last_seen_at, due_at)
           select $1, unnest($2::int[]), 'mission_miss', now(), now()
           on conflict (user_id, item_id) do update set due_at = least(user_item_progress.due_at, now()), last_result = 'mission_miss', last_seen_at = now()`,
          [userId, vocabIds],
        )
      : await client.query(
          `insert into user_item_progress (user_id, item_id, reps, interval_days, last_seen_at, due_at)
           select $1, unnest($2::int[]), 1, 1, now(), now() + interval '1 day'
           on conflict (user_id, item_id) do nothing`,
          [userId, vocabIds],
        );
    reviewScheduled = weak ? (r.rowCount ?? 0) : 0;
  }

  const done = await completedMissions(userId, client);
  done.add(m.id);
  const lessons = await lessonsDone(userId, m.language_code, client);
  const nextRow = (
    await client.query<MissionRow>(`select * from missions where language_code = $1 and review_status = any($2) order by region, sort_order, id`, [
      m.language_code,
      PLAYABLE_STATUSES,
    ])
  ).rows.find((x) => x.id !== m.id && missionStatus(unlockOf(x), done, lessons) === "available");

  const weakest = [...steps].sort((x, y) => x.score - y.score)[0];
  const summary: MissionSummary = {
    score,
    xp,
    firstCompletion,
    learnedPt: spec.learnedPt,
    wellDone: steps.filter((x) => x.score >= 0.85).map((x) => x.s.goalPt),
    corrections: steps
      .filter((x) => x.score < 0.85)
      .map((x) => ({ goalPt: x.s.goalPt, answer: x.last?.answer_text ?? "", notes: x.notes, model: x.s.model })),
    practice: weakest && weakest.score < 1 ? { phrase: weakest.s.model, goalPt: weakest.s.goalPt } : null,
    reviewScheduled,
    next: nextRow ? { id: nextRow.id, title: nextRow.title } : null,
  };
  await client.query(`update mission_attempts set status = 'completed', finished_at = now(), score = $2, xp_awarded = $3, summary = $4 where id = $1`, [
    a.id,
    score,
    xp,
    JSON.stringify(summary),
  ]);
  return summary;
}

export { MISSION_XP };
