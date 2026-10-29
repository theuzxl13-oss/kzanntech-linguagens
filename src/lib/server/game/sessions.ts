import type { PoolClient } from "pg";
import { z } from "zod";
import { checkAnswer, RESULT_CREDIT } from "../../domain/answer-check";
import { ITEM_GRACE_SECONDS, MAX_ATTEMPTS, UNTIMED_SESSION_MAX_SECONDS, getPreset, type ItemFormat } from "../../domain/presets";
import { expectedResponseMs, speedFactor, typingItemPoints, voiceAttemptScore, voiceItemPoints } from "../../domain/scoring";
import { bestVoiceMatch, voiceFeedback, type WordMatch } from "../../domain/voice-match";
import { config } from "../config";
import { getAcceptedAnswers, getLanguage, getUserLanguageLevel, selectLanguage } from "../content";
import { query, queryOne, tx } from "../db";
import { badRequest, conflict, forbidden, gone, notFound } from "../errors";
import { logEvent } from "../events";
import { enforceRateLimit } from "../rate-limit";
import { getScoringRules } from "../settings";
import { getSpeechProvider, SpeechProviderError } from "../speech";
import { finishSession } from "./finish";
import { selectItems, type AudioSource } from "./selection";

export const createSessionSchema = z.object({
  language: z.string().regex(/^[a-z]{2,3}$/, "Idioma inválido."),
  mode: z.enum(["typing", "voice"]),
  preset: z.string().max(40),
  format: z.enum(["translate", "write", "listen", "mixed"]).optional(),
  ranked: z.boolean().default(false),
  unitId: z.number().int().positive().nullable().optional(),
  focus: z.enum(["review"]).nullable().optional(),
});

export const answerSchema = z.object({
  idx: z.number().int().min(0).max(500),
  attempt: z.number().int().min(1).max(MAX_ATTEMPTS),
  answer: z.string().max(500, "Resposta longa demais."),
});

export const skipSchema = z.object({
  idx: z.number().int().min(0).max(500),
  reason: z.enum(["unknown", "audio_unavailable"]).default("unknown"),
});

export const voiceTranscriptSchema = z.object({
  idx: z.number().int().min(0).max(500),
  attempt: z.number().int().min(1).max(MAX_ATTEMPTS),
  transcripts: z.array(z.string().max(300)).min(1).max(5),
});

export interface SessionUser {
  id: string;
  voiceConsent: boolean;
}

interface SessionRow {
  id: string;
  user_id: string;
  language_code: string;
  mode: "typing" | "voice";
  format: string;
  kind: "ranked" | "practice" | "placement";
  preset: string;
  duration_seconds: number | null;
  target_count: number;
  verification: "server" | "client";
  status: "active" | "finished";
  started_at: Date;
  timer_started_at: Date | null;
  expires_at: Date;
}

interface ItemRow {
  idx: number;
  item_id: number;
  format: ItemFormat;
  is_review: boolean;
  audio_source: AudioSource;
  served_at: Date | null;
  answered_at: Date | null;
  attempts: number;
  excluded: boolean;
  result: string | null;
  score: number | null;
  points: number;
  text: string;
  translation_pt: string;
  explanation: string | null;
  kind: string;
  level_code: string;
  difficulty: number;
  category: string;
}

const MAX_EXCLUDED_PER_SESSION = 3;

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export async function createSession(user: SessionUser, input: z.infer<typeof createSessionSchema>) {
  await enforceRateLimit(`session:create:${user.id}`, 40, 600, "Você iniciou muitas sessões em pouco tempo. Aguarde alguns minutos.");
  const preset = getPreset(input.preset);
  if (!preset || preset.mode !== input.mode) throw badRequest("invalid_preset", "Configuração de sessão inválida.");
  const lang = await getLanguage(input.language);
  if (!lang || !lang.is_active) throw badRequest("invalid_language", "Idioma indisponível.");

  // Sessões filtradas (unidade ou revisão) são só prática: o ranking usa a seleção adaptativa completa.
  const focused = !!input.unitId || !!input.focus;
  const kind = preset.id === "placement" ? "placement" : input.ranked && preset.rankedAllowed && !focused ? "ranked" : "practice";
  const format = input.mode === "voice" ? "speak" : preset.id === "placement" ? "translate" : (input.format ?? "mixed");

  let verification: "server" | "client" = "server";
  const provider = getSpeechProvider();
  if (input.mode === "voice") {
    if (!user.voiceConsent) {
      throw forbidden("Para usar o Jogo com Vozes, aceite o aviso de uso do microfone e processamento de voz.");
    }
    verification = provider ? "server" : "client";
    if (kind === "ranked" && verification === "client" && !config.voiceAllowClientRanked) {
      throw conflict(
        "voice_ranked_unavailable",
        "As sessões competitivas de voz exigem avaliação no servidor, que não está configurada. Use o treino livre.",
      );
    }
  }

  // Uma sessão ativa por vez: sessões anteriores abertas são encerradas e contabilizadas como estão.
  const actives = await query<{ id: string }>(`select id from game_sessions where user_id = $1 and status = 'active'`, [user.id]);
  for (const a of actives) await finishSession(user.id, a.id, "replaced");

  await selectLanguage(user.id, input.language);
  const levelCode = await getUserLanguageLevel(user.id, input.language);
  const rules = await getScoringRules();

  const sessionId = await tx(async (client) => {
    const items = await selectItems(client, {
      userId: user.id,
      language: input.language,
      mode: input.mode,
      format: format as never,
      kind,
      poolSize: preset.poolSize,
      levelCode,
      unitId: input.unitId ?? null,
      focus: input.focus ?? null,
      serverTts: !!provider,
    });
    const expiresInSec = preset.durationSeconds ? 15 * 60 : UNTIMED_SESSION_MAX_SECONDS;
    const s = await client.query<{ id: string }>(
      `insert into game_sessions (user_id, language_code, mode, format, kind, preset, duration_seconds, target_count, verification,
                                  focus, expires_at, rules_version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + make_interval(secs => $11), $12) returning id`,
      [
        user.id,
        input.language,
        input.mode,
        format,
        kind,
        preset.id,
        preset.durationSeconds,
        preset.id === "placement" ? items.length : preset.targetCount,
        verification,
        input.focus ?? null,
        expiresInSec,
        rules.version,
      ],
    );
    const id = s.rows[0].id;
    await client.query(
      `insert into session_items (session_id, idx, item_id, format, is_review, audio_source)
       select $1, t.idx - 1, t.item_id, t.format, t.is_review, t.audio_source
         from unnest($2::int[], $3::text[], $4::bool[], $5::text[]) with ordinality as t(item_id, format, is_review, audio_source, idx)`,
      [id, items.map((i) => i.itemId), items.map((i) => i.format), items.map((i) => i.isReview), items.map((i) => i.audioSource)],
    );
    return id;
  });
  return { id: sessionId, kind };
}

// ---------------------------------------------------------------------------
// Leitura e montagem de enunciados
// ---------------------------------------------------------------------------

async function lockSession(client: PoolClient, userId: string, sessionId: string): Promise<SessionRow> {
  if (!z.uuid().safeParse(sessionId).success) throw notFound("Sessão não encontrada.");
  const s = (await client.query<SessionRow>(`select * from game_sessions where id = $1 and user_id = $2 for update`, [sessionId, userId]))
    .rows[0];
  if (!s) throw notFound("Sessão não encontrada.");
  return s;
}

function isExpired(s: SessionRow, now = new Date(), withGrace = false): boolean {
  const limit = new Date(s.expires_at).getTime() + (withGrace && s.timer_started_at ? ITEM_GRACE_SECONDS * 1000 : 0);
  return now.getTime() > limit;
}

const ITEM_COLUMNS = `si.idx, si.item_id, si.format, si.is_review, si.audio_source, si.served_at, si.answered_at, si.attempts,
  si.excluded, si.result, si.score::float as score, si.points, ci.text, ci.translation_pt, ci.explanation, ci.kind, ci.level_code,
  lv.difficulty::float as difficulty, c.name_pt as category`;
const ITEM_JOINS = `from session_items si join content_items ci on ci.id = si.item_id join levels lv on lv.code = ci.level_code
  join categories c on c.slug = ci.category_slug`;

async function loadItem(client: PoolClient, sessionId: string, idx: number): Promise<ItemRow> {
  const it = (await client.query<ItemRow>(`select ${ITEM_COLUMNS} ${ITEM_JOINS} where si.session_id = $1 and si.idx = $2`, [sessionId, idx]))
    .rows[0];
  if (!it) throw notFound("Exercício não encontrado nesta sessão.");
  return it;
}

export interface Prompt {
  idx: number;
  format: ItemFormat;
  instruction: string;
  text: string | null;
  translation: string | null;
  kind: string;
  level: string;
  category: string;
  isReview: boolean;
  audio: { type: "server"; url: string } | { type: "browser"; text: string; locale: string } | null;
  answerLanguage: string;
}

function buildPrompt(s: SessionRow, it: ItemRow, lang: { name_pt: string; locale: string }): Prompt {
  const audioServer = it.audio_source === "asset" || it.audio_source === "server_tts";
  const audioFor = (text: string): Prompt["audio"] =>
    audioServer
      ? { type: "server", url: `/api/sessions/${s.id}/items/${it.idx}/audio` }
      : it.audio_source === "browser_tts"
        ? { type: "browser", text, locale: lang.locale }
        : null;
  const base = { idx: it.idx, format: it.format, kind: it.kind, level: it.level_code, category: it.category, isReview: it.is_review };
  switch (it.format) {
    case "translate":
      return { ...base, instruction: "Traduza para o português", text: it.text, translation: null, audio: audioFor(it.text), answerLanguage: "pt" };
    case "write":
      return { ...base, instruction: `Escreva em ${lang.name_pt.toLowerCase()}`, text: it.translation_pt, translation: null, audio: null, answerLanguage: s.language_code };
    case "listen":
      return { ...base, instruction: "Ouça e digite o que você ouviu", text: null, translation: null, audio: audioFor(it.text), answerLanguage: s.language_code };
    case "speak":
      return { ...base, instruction: "Ouça e repita em voz alta", text: it.text, translation: it.translation_pt, audio: audioFor(it.text), answerLanguage: s.language_code };
  }
}

function solutionOf(it: ItemRow) {
  return {
    expected: it.format === "translate" ? it.translation_pt : it.text,
    text: it.text,
    translation: it.translation_pt,
    explanation: it.explanation,
  };
}

async function totalsOf(client: PoolClient, sessionId: string) {
  const rows = (
    await client.query<{ result: string | null; points: number; excluded: boolean }>(
      `select result, points, excluded from session_items where session_id = $1 order by idx`,
      [sessionId],
    )
  ).rows;
  let score = 0;
  let answered = 0;
  let correct = 0;
  let streak = 0;
  for (const r of rows) {
    if (!r.result || r.excluded) continue;
    score += r.points;
    answered++;
    if (RESULT_CREDIT[r.result as keyof typeof RESULT_CREDIT] > 0) {
      correct++;
      streak++;
    } else streak = 0;
  }
  return { score, answered, correct, streak };
}

export async function getSessionView(userId: string, sessionId: string) {
  if (!z.uuid().safeParse(sessionId).success) throw notFound("Sessão não encontrada.");
  const s = await queryOne<SessionRow>(`select * from game_sessions where id = $1 and user_id = $2`, [sessionId, userId]);
  if (!s) throw notFound("Sessão não encontrada.");
  const lang = (await getLanguage(s.language_code))!;
  const items = await query<ItemRow>(`select ${ITEM_COLUMNS} ${ITEM_JOINS} where si.session_id = $1 order by si.idx`, [sessionId]);
  const preset = getPreset(s.preset);
  const totals = await tx((c) => totalsOf(c, sessionId));
  return {
    id: s.id,
    mode: s.mode,
    format: s.format,
    kind: s.kind,
    preset: s.preset,
    presetLabel: preset?.label ?? s.preset,
    pausable: preset?.pausable ?? false,
    status: s.status,
    verification: s.verification,
    durationSeconds: s.duration_seconds,
    targetCount: s.target_count,
    timer: s.duration_seconds && s.timer_started_at ? { startedAt: s.timer_started_at, endsAt: s.expires_at } : null,
    expired: s.status === "active" && isExpired(s, new Date(), true),
    serverNow: new Date(),
    language: { code: lang.code, name: lang.name_pt, flag: lang.flag, locale: lang.locale },
    total: items.length,
    totals,
    items: items.map((it) => ({
      idx: it.idx,
      format: it.format,
      state: it.result ? "answered" : it.served_at ? "served" : "pending",
      result: it.result,
      excluded: it.excluded,
      attempts: it.attempts,
      score: it.score,
      points: it.points,
      prompt: it.served_at ? buildPrompt(s, it, lang) : null,
      solution: it.result ? solutionOf(it) : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Entrega de um exercício (inicia a medição de tempo no servidor)
// ---------------------------------------------------------------------------

export async function serveItem(userId: string, sessionId: string, idx: number) {
  return tx(async (client) => {
    const s = await lockSession(client, userId, sessionId);
    if (s.status !== "active") throw conflict("session_finished", "Esta sessão já foi encerrada.");
    const it = await loadItem(client, sessionId, idx);
    const lang = (await getLanguage(s.language_code))!;
    if (it.served_at) {
      return { prompt: buildPrompt(s, it, lang), timer: timerOf(s) };
    }
    if (isExpired(s)) throw gone("session_expired", "O tempo da sessão terminou.");
    const pending = await client.query(
      `select 1 from session_items where session_id = $1 and idx < $2 and result is null and not excluded limit 1`,
      [sessionId, idx],
    );
    if (pending.rowCount) throw conflict("out_of_order", "Responda o exercício atual antes de avançar.");
    await client.query(`update session_items set served_at = now() where session_id = $1 and idx = $2`, [sessionId, idx]);
    if (s.duration_seconds && !s.timer_started_at) {
      const upd = await client.query<SessionRow>(
        `update game_sessions set timer_started_at = now(), expires_at = now() + make_interval(secs => duration_seconds)
          where id = $1 returning *`,
        [sessionId],
      );
      Object.assign(s, upd.rows[0]);
    }
    return { prompt: buildPrompt(s, it, lang), timer: timerOf(s) };
  });
}

function timerOf(s: SessionRow) {
  return s.duration_seconds && s.timer_started_at ? { startedAt: s.timer_started_at, endsAt: s.expires_at, serverNow: new Date() } : null;
}

function assertAnswerable(s: SessionRow, it: ItemRow) {
  if (s.status !== "active") throw conflict("session_finished", "Esta sessão já foi encerrada.");
  if (!it.served_at) throw conflict("not_served", "Este exercício ainda não foi exibido.");
  if (it.excluded) throw conflict("item_excluded", "Este exercício foi pulado.");
  if (isExpired(s, new Date(), true)) throw gone("session_expired", "O tempo da sessão terminou.");
}

// ---------------------------------------------------------------------------
// Respostas digitadas
// ---------------------------------------------------------------------------

export async function submitTypingAnswer(userId: string, sessionId: string, input: z.infer<typeof answerSchema>) {
  await enforceRateLimit(`answer:${userId}`, 120, 60);
  return tx(async (client) => {
    const s = await lockSession(client, userId, sessionId);
    if (s.mode !== "typing") throw badRequest("wrong_mode", "Esta sessão não é de digitação.");
    const it = await loadItem(client, sessionId, input.idx);

    // Idempotência: reenviar a mesma tentativa devolve o resultado já registrado.
    const replay = (
      await client.query<{ assessment: unknown }>(`select assessment from answers where session_id = $1 and idx = $2 and attempt_no = $3`, [
        sessionId,
        input.idx,
        input.attempt,
      ])
    ).rows[0];
    if (replay) return { ...(replay.assessment as object), replayed: true };

    assertAnswerable(s, it);
    if (input.attempt !== it.attempts + 1) throw conflict("attempt_mismatch", "Tentativa fora de sequência. Recarregue a sessão.");
    if (input.attempt > 1 && it.result === "correct") throw conflict("already_correct", "Este exercício já foi respondido corretamente.");

    const direction = it.format === "translate" ? "to_pt" : "to_target";
    const accepted = await getAcceptedAnswers(it.item_id, direction);
    const check = checkAnswer(input.answer, accepted, direction === "to_pt" ? "pt" : s.language_code);
    const rules = await getScoringRules(client);
    const now = new Date();
    const first = input.attempt === 1;

    let points = it.points;
    let responseMs: number | null = null;
    if (first) {
      responseMs = now.getTime() - new Date(it.served_at!).getTime();
      const speed = check.credit > 0 ? speedFactor(responseMs, expectedResponseMs(it.format, check.primary.length)) : 0;
      const before = await totalsOf(client, sessionId);
      points = typingItemPoints({ credit: check.credit, difficulty: it.difficulty, speed, streakBefore: before.streak }, rules);
      await client.query(
        `update session_items set result = $3, score = $4, points = $5, speed = $6, answered_at = now(), attempts = 1
          where session_id = $1 and idx = $2`,
        [sessionId, input.idx, check.result, check.credit * 100, points, speed],
      );
    } else {
      await client.query(`update session_items set attempts = $3 where session_id = $1 and idx = $2`, [sessionId, input.idx, input.attempt]);
    }
    const totals = await totalsOf(client, sessionId);
    const total = (await client.query<{ n: number }>(`select count(*)::int as n from session_items where session_id = $1`, [sessionId])).rows[0].n;
    const payload = {
      idx: input.idx,
      attempt: input.attempt,
      result: check.result,
      credit: check.credit,
      feedback: check.feedback,
      isAlternative: check.isAlternative,
      userAnswer: input.answer,
      matched: check.matched,
      solution: solutionOf(it),
      points: first ? points : 0,
      countsForScore: first,
      canRetry: input.attempt < MAX_ATTEMPTS && check.result !== "correct",
      totals,
      isLast: input.idx >= total - 1,
    };
    await client.query(
      `insert into answers (session_id, idx, user_id, attempt_no, answer_text, result, score, response_ms, assessment)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [sessionId, input.idx, userId, input.attempt, input.answer, check.result, check.credit * 100, responseMs, JSON.stringify(payload)],
    );
    return payload;
  });
}

export async function skipItem(userId: string, sessionId: string, input: z.infer<typeof skipSchema>) {
  return tx(async (client) => {
    const s = await lockSession(client, userId, sessionId);
    const it = await loadItem(client, sessionId, input.idx);
    if (it.result) return { idx: input.idx, skipped: false, excluded: it.excluded, solution: solutionOf(it), totals: await totalsOf(client, sessionId) };
    assertAnswerable(s, it);
    let excluded = false;
    if (input.reason === "audio_unavailable" && (it.format === "listen" || it.format === "speak")) {
      const n = (
        await client.query<{ n: number }>(`select count(*)::int as n from session_items where session_id = $1 and excluded`, [sessionId])
      ).rows[0].n;
      excluded = n < MAX_EXCLUDED_PER_SESSION;
    }
    await client.query(
      `update session_items set result = 'skipped', excluded = $3, score = 0, points = 0, answered_at = now() where session_id = $1 and idx = $2`,
      [sessionId, input.idx, excluded],
    );
    return { idx: input.idx, skipped: true, excluded, solution: solutionOf(it), totals: await totalsOf(client, sessionId) };
  });
}

// ---------------------------------------------------------------------------
// Voz
// ---------------------------------------------------------------------------

interface VoiceEval {
  score: number;
  recognized: string;
  words: WordMatch[];
  details: { accuracy: number; fluency: number; completeness: number } | null;
  provider: string;
}

export async function submitVoiceAttempt(
  userId: string,
  sessionId: string,
  input: { idx: number; attempt: number; transcripts?: string[]; audio?: { data: Buffer; contentType: string } },
) {
  await enforceRateLimit(`voice:${userId}`, 40, 60);
  // 1) Validação sem bloqueio (a chamada ao provedor pode levar alguns segundos)
  if (!z.uuid().safeParse(sessionId).success) throw notFound("Sessão não encontrada.");
  const s = await queryOne<SessionRow>(`select * from game_sessions where id = $1 and user_id = $2`, [sessionId, userId]);
  if (!s) throw notFound("Sessão não encontrada.");
  if (s.mode !== "voice") throw badRequest("wrong_mode", "Esta sessão não é de voz.");
  const replay = await queryOne<{ assessment: unknown }>(`select assessment from answers where session_id = $1 and idx = $2 and attempt_no = $3`, [
    sessionId,
    input.idx,
    input.attempt,
  ]);
  if (replay) return { ...(replay.assessment as object), replayed: true };
  const itPre = await tx((c) => loadItem(c, sessionId, input.idx));
  assertAnswerable(s, itPre);
  if (input.attempt !== itPre.attempts + 1) throw conflict("attempt_mismatch", "Tentativa fora de sequência. Recarregue a sessão.");

  const lang = (await getLanguage(s.language_code))!;
  let evaluation: VoiceEval;
  if (s.verification === "server") {
    const provider = getSpeechProvider();
    if (!provider) throw conflict("speech_unavailable", "O serviço de avaliação de voz não está disponível no momento.");
    if (!input.audio) throw badRequest("audio_required", "Envie o áudio da tentativa.");
    try {
      const a = await provider.assessPronunciation(input.audio.data, input.audio.contentType, itPre.text, lang.locale);
      const words: WordMatch[] = a.words
        .filter((w) => w.errorType !== "Insertion")
        .map((w) => ({
          word: w.word,
          status: w.errorType === "Omission" ? "missing" : w.errorType === "Mispronunciation" || w.accuracy < 60 ? "close" : "ok",
        }));
      evaluation = {
        score: a.recognizedText ? Math.round(a.pronunciationScore) : 0,
        recognized: a.recognizedText,
        words,
        details: { accuracy: a.accuracyScore, fluency: a.fluencyScore, completeness: a.completenessScore },
        provider: provider.id,
      };
    } catch (err) {
      await logEvent("error", "speech.assess", (err as Error).message, { provider: provider.id }, userId);
      if (err instanceof SpeechProviderError) {
        throw conflict("speech_failed", "Não foi possível avaliar o áudio agora. Tente novamente em instantes.");
      }
      throw err;
    }
  } else {
    if (!input.transcripts?.length) throw badRequest("transcript_required", "Nenhuma fala foi reconhecida.");
    const options = (await getAcceptedAnswers(itPre.item_id, "to_target")).map((a) => a.answer);
    const m = bestVoiceMatch(options.length ? options : [itPre.text], input.transcripts, s.language_code);
    evaluation = { score: m.score, recognized: m.transcript, words: m.words, details: null, provider: "browser" };
  }

  // 2) Registro transacional
  return tx(async (client) => {
    const locked = await lockSession(client, userId, sessionId);
    const it = await loadItem(client, sessionId, input.idx);
    const again = (
      await client.query<{ assessment: unknown }>(`select assessment from answers where session_id = $1 and idx = $2 and attempt_no = $3`, [
        sessionId,
        input.idx,
        input.attempt,
      ])
    ).rows[0];
    if (again) return { ...(again.assessment as object), replayed: true };
    assertAnswerable(locked, it);
    if (input.attempt !== it.attempts + 1) throw conflict("attempt_mismatch", "Tentativa fora de sequência. Recarregue a sessão.");

    const rules = await getScoringRules(client);
    const attemptScore = voiceAttemptScore(evaluation.score, input.attempt, rules);
    const best = Math.max(it.score ?? 0, attemptScore);
    const points = voiceItemPoints(best, it.difficulty);
    const result = best >= rules.voice.passScore ? "correct" : "wrong";
    await client.query(
      `update session_items set attempts = $3, score = $4, points = $5, result = $6, answered_at = coalesce(answered_at, now())
        where session_id = $1 and idx = $2`,
      [sessionId, input.idx, input.attempt, best, points, result],
    );
    const totals = await totalsOf(client, sessionId);
    const total = (await client.query<{ n: number }>(`select count(*)::int as n from session_items where session_id = $1`, [sessionId])).rows[0].n;
    const feedback = voiceFeedback(evaluation.score, evaluation.words);
    const payload = {
      idx: input.idx,
      attempt: input.attempt,
      verification: locked.verification,
      approximate: locked.verification === "client",
      provider: evaluation.provider,
      score: evaluation.score,
      attemptScore,
      bestScore: best,
      points,
      passed: result === "correct",
      recognized: evaluation.recognized,
      words: evaluation.words,
      details: evaluation.details,
      feedback,
      solution: solutionOf(it),
      canRetry: input.attempt < MAX_ATTEMPTS,
      totals,
      isLast: input.idx >= total - 1,
    };
    await client.query(
      `insert into answers (session_id, idx, user_id, attempt_no, answer_text, result, score, assessment)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [sessionId, input.idx, userId, input.attempt, evaluation.recognized.slice(0, 500), result, evaluation.score, JSON.stringify(payload)],
    );
    return payload;
  });
}

// ---------------------------------------------------------------------------
// Áudio de referência servido pelo servidor (não revela o texto ao navegador)
// ---------------------------------------------------------------------------

export async function getItemAudio(userId: string, sessionId: string, idx: number, rate = 1) {
  if (!z.uuid().safeParse(sessionId).success) throw notFound();
  const row = await queryOne<{ text: string; item_id: number; audio_source: string; served_at: Date | null; language_code: string; locale: string }>(
    `select ci.text, si.item_id, si.audio_source, si.served_at, s.language_code, l.locale
       from game_sessions s
       join session_items si on si.session_id = s.id
       join content_items ci on ci.id = si.item_id
       join languages l on l.code = s.language_code
      where s.id = $1 and s.user_id = $2 and si.idx = $3`,
    [sessionId, userId, idx],
  );
  if (!row || !row.served_at) throw notFound("Áudio indisponível.");
  return resolveItemAudio(row.item_id, row.text, row.locale, row.audio_source, rate);
}

/**
 * O servidor só busca áudios em caminhos locais (/audio/...) ou em hosts explicitamente permitidos
 * (AUDIO_ALLOWED_HOSTS, separados por vírgula) — evita que uma URL cadastrada vire SSRF.
 */
export function isAllowedAudioUrl(url: string, allowed = process.env.AUDIO_ALLOWED_HOSTS ?? ""): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const u = new URL(url);
    const hosts = allowed.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
    return u.protocol === "https:" && hosts.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function resolveItemAudio(itemId: number, text: string, locale: string, audioSource: string, rate = 1) {
  if (audioSource === "asset") {
    const asset = await queryOne<{ url: string }>(
      `select url from audio_assets where item_id = $1 and review_status <> 'archived' order by (review_status = 'approved') desc, id limit 1`,
      [itemId],
    );
    if (asset && isAllowedAudioUrl(asset.url)) {
      const res = await fetch(new URL(asset.url, config.appUrl), { signal: AbortSignal.timeout(8000), redirect: "error" }).catch(() => null);
      if (res?.ok) return { audio: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "audio/mpeg" };
      await logEvent("warn", "audio.asset", "Falha ao carregar arquivo de áudio", { itemId, url: asset.url });
    }
  }
  const provider = getSpeechProvider();
  if (!provider) throw conflict("audio_unavailable", "Áudio indisponível no servidor.");
  try {
    return await provider.synthesize(text, locale, { rate });
  } catch (err) {
    await logEvent("error", "speech.tts", (err as Error).message, { itemId });
    throw conflict("audio_unavailable", "Não foi possível gerar o áudio agora.");
  }
}

/** Resultado de uma sessão finalizada com a revisão de cada exercício (página de resultado). */
export async function getSessionReport(userId: string, sessionId: string) {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const s = await queryOne<SessionRow & { result: unknown; format: string; finished_at: Date | null }>(
    `select * from game_sessions where id = $1 and user_id = $2`,
    [sessionId, userId],
  );
  if (!s) return null;
  const lang = (await getLanguage(s.language_code))!;
  const items = await query<{
    idx: number;
    format: string;
    result: string | null;
    excluded: boolean;
    score: number | null;
    points: number;
    xp: number;
    attempts: number;
    text: string;
    translation_pt: string;
    first_answer: string | null;
  }>(
    `select si.idx, si.format, si.result, si.excluded, si.score::float as score, si.points, si.xp, si.attempts, ci.text, ci.translation_pt,
            (select a.answer_text from answers a where a.session_id = si.session_id and a.idx = si.idx order by a.attempt_no limit 1) as first_answer
       from session_items si join content_items ci on ci.id = si.item_id
      where si.session_id = $1 and si.result is not null order by si.idx`,
    [sessionId],
  );
  return { session: s, language: lang, items };
}
