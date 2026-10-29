/**
 * Substituto de src/lib/client/api.ts na DEMONSTRAÇÃO estática.
 * Simula as rotas de API no próprio navegador usando as mesmas regras de domínio do servidor
 * (correção, pontuação, XP, revisão espaçada, conquistas). Sem banco e sem validação anti-fraude:
 * serve apenas para conhecer a interface.
 */
import { demoAnswer, demoAttemptView, demoHint, demoStartMission } from "./missions";
import { evaluateAchievements } from "@/lib/domain/achievements";
import { checkAnswer, RESULT_CREDIT } from "@/lib/domain/answer-check";
import { challengeProgress, dailyChallenges } from "@/lib/domain/challenges";
import { ITEM_GRACE_SECONDS, MAX_ATTEMPTS, getPreset } from "@/lib/domain/presets";
import {
  DEFAULT_RULES,
  expectedResponseMs,
  itemXp,
  levelFromXp,
  speedFactor,
  typingItemPoints,
  typingRankPoints,
  voiceAttemptScore,
  voiceItemPoints,
  voiceRankPoints,
} from "@/lib/domain/scoring";
import { nextReview, qualityFromTyping, qualityFromVoice } from "@/lib/domain/srs";
import { bestVoiceMatch, voiceFeedback } from "@/lib/domain/voice-match";
import { demoCompleteLesson } from "./lessons";
import { ACHIEVEMENTS, ITEM_BY_ID, ITEMS, LANGUAGES, load, save, todayLocal, type DemoSession, type DemoState } from "./store";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const delay = () => new Promise((r) => setTimeout(r, 120));
const rules = DEFAULT_RULES;
const AVATARS = ["fox", "cat", "owl", "panda", "rabbit", "bear", "koala", "penguin", "frog", "lion"];

function missionRoute(s: DemoState, path: string, body: Record<string, unknown>) {
  const start = path.match(/^\/api\/missions\/([a-z0-9-]+)\/start$/);
  if (start) return demoStartMission(s, start[1]);
  const act = path.match(/^\/api\/missions\/attempts\/([0-9a-f-]+)(?:\/(answer|hint))?$/);
  if (act) {
    if (act[2] === "answer") return demoAnswer(s, act[1], { step: Number(body.step), tryNo: Number(body.tryNo), text: String(body.text ?? "") });
    if (act[2] === "hint") return demoHint(s, act[1], Number(body.step));
    const view = demoAttemptView(s, act[1]);
    if (!view) throw new ApiError(404, "not_found", "Missão não encontrada.");
    return view;
  }
  throw new ApiError(404, "not_found", "Não encontrado.");
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  await delay();
  const body = (opts.body ?? {}) as Record<string, unknown>;
  const s = load();
  if (/^\/api\/lessons\/\d+\/start$/.test(path)) return { ok: true } as T;
  if (path.startsWith("/api/missions")) {
    requireUser(s);
    try {
      const r = missionRoute(s, path, body);
      save(s);
      return r as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(409, "mission_error", (err as Error).message);
    }
  }
  const lessonDone = path.match(/^\/api\/lessons\/(\d+)\/complete$/);
  if (lessonDone) {
    requireUser(s);
    const r = demoCompleteLesson(s, Number(lessonDone[1]), Number(body.accuracy ?? 0));
    save(s);
    return r as T;
  }
  const m = path.match(/^\/api\/sessions\/([^/]+)\/(serve|answer|skip|speak|finish)$/);
  if (m) {
    const session = s.sessions[m[1]];
    if (!session) throw new ApiError(404, "not_found", "Sessão não encontrada.");
    const handlers = { serve, answer, skip, speak, finish } as const;
    const r = handlers[m[2] as keyof typeof handlers](s, session, body);
    save(s);
    return r as T;
  }
  switch (path) {
    case "/api/auth/signup":
    case "/api/auth/login": {
      const nick = String(body.nickname ?? body.email ?? "visitante").split("@")[0].replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 24) || "visitante";
      if (!s.user) {
        s.user = {
          nickname: nick.length >= 3 ? nick : "visitante",
          avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
          avatarColor: "violet",
          currentLanguage: null,
          levels: {},
          voiceConsent: false,
          weeklyGoalXp: 300,
        };
      }
      save(s);
      return { ok: true } as T;
    }
    case "/api/auth/logout":
      // Na demo, "sair" apenas volta ao início (o progresso continua salvo neste navegador).
      location.replace(`${location.pathname}#/`);
      return new Promise<T>(() => {});
    case "/api/auth/forgot":
      return { ok: true, emailTransport: "disabled" } as T;
    case "/api/languages/select": {
      requireUser(s);
      s.user!.currentLanguage = String(body.language);
      if (body.level) s.user!.levels[String(body.language)] = String(body.level);
      else s.user!.levels[String(body.language)] ??= "A1";
      save(s);
      return { ok: true } as T;
    }
    case "/api/profile/voice-consent":
      requireUser(s);
      s.user!.voiceConsent = !!body.consent;
      save(s);
      return { ok: true, consent: !!body.consent } as T;
    case "/api/profile":
      requireUser(s);
      Object.assign(s.user!, body);
      save(s);
      return { ok: true } as T;
    case "/api/sessions": {
      const r = createSession(s, body);
      save(s);
      return r as T;
    }
  }
  throw new ApiError(404, "not_available", "Recurso indisponível na demonstração.");
}

function requireUser(s: DemoState) {
  if (!s.user) throw new ApiError(401, "unauthorized", "Crie uma conta de demonstração para continuar.");
}

// ---------------------------------------------------------------------------

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function createSession(s: DemoState, b: Record<string, unknown>) {
  requireUser(s);
  const preset = getPreset(String(b.preset));
  if (!preset) throw new ApiError(400, "invalid_preset", "Configuração inválida.");
  const language = String(b.language);
  const mode = b.mode === "voice" ? "voice" : "typing";
  if (mode === "voice" && !s.user!.voiceConsent) throw new ApiError(403, "forbidden", "Aceite o aviso de uso do microfone para continuar.");
  const focused = !!b.unitId || !!b.focus;
  const kind = preset.id === "placement" ? "placement" : b.ranked && preset.rankedAllowed && !focused ? "ranked" : "practice";
  const format = mode === "voice" ? "speak" : preset.id === "placement" ? "translate" : String(b.format ?? "mixed");
  for (const old of Object.values(s.sessions)) if (old.status === "active") finishInternal(s, old, "replaced");

  const levelCode = s.user!.levels[language] ?? "A1";
  const levelOrder = ["A1", "A2", "B1", "B2", "C1", "C2"].indexOf(levelCode) + 1;
  let pool = ITEMS.filter((i) => i.language === language);
  if (b.unitId) pool = pool.filter((i) => i.unitId === Number(b.unitId));
  const now = Date.now();
  let picked: typeof ITEMS;
  if (kind === "placement") {
    picked = ["A1", "A2", "B1", "B2"].flatMap((lv) => shuffle(pool.filter((i) => i.level === lv)).slice(0, 3));
  } else {
    if (b.focus === "review") pool = pool.filter((i) => s.progress[i.id] && s.progress[i.id].dueAt <= now);
    let window = pool.filter((i) => i.levelOrder <= levelOrder);
    if (window.length < preset.poolSize) window = pool.filter((i) => i.levelOrder <= levelOrder + 1);
    if (!window.length) window = pool;
    if (!window.length) throw new ApiError(409, "no_content", "Não há exercícios para este filtro.");
    const due = shuffle(window.filter((i) => s.progress[i.id]?.dueAt <= now));
    const rest = shuffle(window.filter((i) => !due.includes(i)));
    picked = [...due.slice(0, Math.ceil(preset.poolSize * 0.4)), ...rest];
    while (picked.length < preset.poolSize) picked = [...picked, ...shuffle(window)];
    picked = shuffle(picked.slice(0, preset.poolSize));
  }
  const id = crypto.randomUUID();
  const session: DemoSession = {
    id,
    language,
    mode,
    format,
    kind,
    preset: preset.id,
    durationSeconds: preset.durationSeconds,
    targetCount: kind === "placement" ? picked.length : preset.targetCount,
    status: "active",
    startedAt: now,
    timerStartedAt: null,
    expiresAt: now + (preset.durationSeconds ? 15 * 60_000 : 2 * 3600_000),
    finishedAt: null,
    result: null,
    items: picked.map((it) => {
      const f = mode === "voice" ? "speak" : format === "mixed" ? (["translate", "write", "listen"] as const)[Math.floor(Math.random() * 3)] : (format as "translate");
      return {
        itemId: it.id,
        format: f,
        isReview: !!s.progress[it.id] && s.progress[it.id].dueAt <= now,
        servedAt: null,
        answeredAt: null,
        attempts: 0,
        excluded: false,
        result: null,
        score: null,
        points: 0,
        speed: null,
        xp: 0,
        firstAnswer: null,
        answers: {},
      };
    }),
  };
  s.sessions[id] = session;
  return { id, kind };
}

function buildPrompt(session: DemoSession, idx: number) {
  const si = session.items[idx];
  const it = ITEM_BY_ID.get(si.itemId)!;
  const lang = LANGUAGES.find((l) => l.code === session.language)!;
  const audio = (text: string) => ({ type: "browser" as const, text, locale: lang.locale });
  const base = { idx, format: si.format, kind: it.kind, level: it.level, category: it.categoryName, isReview: si.isReview };
  switch (si.format) {
    case "translate":
      return { ...base, instruction: "Traduza para o português", text: it.text, translation: null, audio: audio(it.text), answerLanguage: "pt" };
    case "write":
      return { ...base, instruction: `Escreva em ${lang.name_pt.toLowerCase()}`, text: it.translation, translation: null, audio: null, answerLanguage: session.language };
    case "listen":
      return { ...base, instruction: "Ouça e digite o que você ouviu", text: null, translation: null, audio: audio(it.text), answerLanguage: session.language };
    default:
      return { ...base, instruction: "Ouça e repita em voz alta", text: it.text, translation: it.translation, audio: audio(it.text), answerLanguage: session.language };
  }
}

function solutionOf(session: DemoSession, idx: number) {
  const si = session.items[idx];
  const it = ITEM_BY_ID.get(si.itemId)!;
  return { expected: si.format === "translate" ? it.translation : it.text, text: it.text, translation: it.translation, explanation: it.explanation };
}

function totalsOf(session: DemoSession) {
  let score = 0;
  let answered = 0;
  let correct = 0;
  let streak = 0;
  for (const r of session.items) {
    if (!r.result || r.excluded) continue;
    score += r.points;
    answered++;
    const ok = session.mode === "voice" ? r.result === "correct" : RESULT_CREDIT[r.result as keyof typeof RESULT_CREDIT] > 0;
    if (ok) {
      correct++;
      streak++;
    } else streak = 0;
  }
  return { score, answered, correct, streak };
}

function timerOf(session: DemoSession) {
  return session.durationSeconds && session.timerStartedAt
    ? { startedAt: new Date(session.timerStartedAt), endsAt: new Date(session.expiresAt), serverNow: new Date() }
    : null;
}

export function getView(id: string) {
  const s = load();
  const session = s.sessions[id];
  if (!session) return null;
  const lang = LANGUAGES.find((l) => l.code === session.language)!;
  const preset = getPreset(session.preset);
  return {
    id,
    mode: session.mode,
    format: session.format,
    kind: session.kind,
    preset: session.preset,
    presetLabel: preset?.label ?? session.preset,
    pausable: preset?.pausable ?? false,
    status: session.status,
    verification: "client" as const,
    durationSeconds: session.durationSeconds,
    targetCount: session.targetCount,
    timer: timerOf(session),
    expired: false,
    serverNow: new Date(),
    language: { code: lang.code, name: lang.name_pt, flag: lang.flag, locale: lang.locale },
    total: session.items.length,
    totals: totalsOf(session),
    items: session.items.map((it, idx) => ({
      idx,
      format: it.format,
      state: it.result ? "answered" : it.servedAt ? "served" : "pending",
      result: it.result,
      excluded: it.excluded,
      attempts: it.attempts,
      score: it.score,
      points: it.points,
      prompt: it.servedAt ? buildPrompt(session, idx) : null,
      solution: it.result ? solutionOf(session, idx) : null,
    })),
  };
}

function assertActive(session: DemoSession) {
  if (session.status !== "active") throw new ApiError(409, "session_finished", "Esta sessão já foi encerrada.");
  const grace = session.timerStartedAt ? ITEM_GRACE_SECONDS * 1000 : 0;
  if (Date.now() > session.expiresAt + grace) throw new ApiError(410, "session_expired", "O tempo da sessão terminou.");
}

function serve(_s: DemoState, session: DemoSession, b: Record<string, unknown>) {
  const idx = Number(b.idx);
  const si = session.items[idx];
  if (!si) throw new ApiError(404, "not_found", "Exercício não encontrado.");
  if (!si.servedAt) {
    if (session.status !== "active" || Date.now() > session.expiresAt) throw new ApiError(410, "session_expired", "O tempo da sessão terminou.");
    if (session.items.slice(0, idx).some((i) => !i.result && !i.excluded)) throw new ApiError(409, "out_of_order", "Responda o exercício atual antes.");
    si.servedAt = Date.now();
    if (session.durationSeconds && !session.timerStartedAt) {
      session.timerStartedAt = Date.now();
      session.expiresAt = Date.now() + session.durationSeconds * 1000;
    }
  }
  return { prompt: buildPrompt(session, idx), timer: timerOf(session) };
}

function answer(_s: DemoState, session: DemoSession, b: Record<string, unknown>) {
  const idx = Number(b.idx);
  const attempt = Number(b.attempt);
  const si = session.items[idx];
  if (si.answers[attempt]) return { ...(si.answers[attempt] as object), replayed: true };
  assertActive(session);
  if (attempt !== si.attempts + 1) throw new ApiError(409, "attempt_mismatch", "Tentativa fora de sequência.");
  const it = ITEM_BY_ID.get(si.itemId)!;
  const toPt = si.format === "translate";
  const accepted = toPt
    ? [{ answer: it.translation, isPrimary: true }, ...it.altPt.map((a) => ({ answer: a, isPrimary: false }))]
    : [{ answer: it.text, isPrimary: true }, ...it.altTarget.map((a) => ({ answer: a, isPrimary: false }))];
  const text = String(b.answer ?? "");
  const check = checkAnswer(text, accepted, toPt ? "pt" : session.language);
  const first = attempt === 1;
  if (first) {
    const ms = Date.now() - (si.servedAt ?? Date.now());
    const speed = check.credit > 0 ? speedFactor(ms, expectedResponseMs(si.format, check.primary.length)) : 0;
    const before = totalsOf(session);
    si.points = typingItemPoints({ credit: check.credit, difficulty: it.difficulty, speed, streakBefore: before.streak }, rules);
    si.result = check.result;
    si.score = check.credit * 100;
    si.speed = speed;
    si.answeredAt = Date.now();
    si.firstAnswer = text;
  }
  si.attempts = attempt;
  const payload = {
    idx,
    attempt,
    result: check.result,
    credit: check.credit,
    feedback: check.feedback,
    isAlternative: check.isAlternative,
    userAnswer: text,
    matched: check.matched,
    solution: solutionOf(session, idx),
    points: first ? si.points : 0,
    countsForScore: first,
    canRetry: attempt < MAX_ATTEMPTS && check.result !== "correct",
    totals: totalsOf(session),
    isLast: idx >= session.items.length - 1,
  };
  si.answers[attempt] = payload;
  return payload;
}

function skip(_s: DemoState, session: DemoSession, b: Record<string, unknown>) {
  const idx = Number(b.idx);
  const si = session.items[idx];
  if (!si.result) {
    assertActive(session);
    const excluded = b.reason === "audio_unavailable" && (si.format === "listen" || si.format === "speak") && session.items.filter((i) => i.excluded).length < 3;
    si.result = "skipped";
    si.excluded = excluded;
    si.score = 0;
    si.points = 0;
    si.answeredAt = Date.now();
  }
  return { idx, skipped: true, excluded: si.excluded, solution: solutionOf(session, idx), totals: totalsOf(session) };
}

function speak(_s: DemoState, session: DemoSession, b: Record<string, unknown>) {
  const idx = Number(b.idx);
  const attempt = Number(b.attempt);
  const si = session.items[idx];
  if (si.answers[attempt]) return { ...(si.answers[attempt] as object), replayed: true };
  assertActive(session);
  const transcripts = (b.transcripts as string[] | undefined) ?? [];
  if (!transcripts.length) throw new ApiError(400, "transcript_required", "Nenhuma fala foi reconhecida.");
  const it = ITEM_BY_ID.get(si.itemId)!;
  const match = bestVoiceMatch([it.text, ...it.altTarget], transcripts, session.language);
  const attemptScore = voiceAttemptScore(match.score, attempt, rules);
  const best = Math.max(si.score ?? 0, attemptScore);
  si.attempts = attempt;
  si.score = best;
  si.points = voiceItemPoints(best, it.difficulty);
  si.result = best >= rules.voice.passScore ? "correct" : "wrong";
  si.answeredAt ??= Date.now();
  si.firstAnswer ??= match.transcript;
  const payload = {
    idx,
    attempt,
    verification: "client",
    approximate: true,
    provider: "browser",
    score: match.score,
    attemptScore,
    bestScore: best,
    points: si.points,
    passed: si.result === "correct",
    recognized: match.transcript,
    words: match.words,
    details: null,
    feedback: voiceFeedback(match.score, match.words),
    solution: solutionOf(session, idx),
    canRetry: attempt < MAX_ATTEMPTS,
    totals: totalsOf(session),
    isLast: idx >= session.items.length - 1,
  };
  si.answers[attempt] = payload;
  return payload;
}

function finish(s: DemoState, session: DemoSession, b: Record<string, unknown>) {
  return finishInternal(s, session, String(b.reason ?? "completed"));
}

function finishInternal(s: DemoState, session: DemoSession, endReason: string) {
  if (session.status === "finished") return session.result;
  const now = Date.now();
  const isVoice = session.mode === "voice";
  const answered = session.items.filter((i) => i.result && !i.excluded);
  const creditOf = (i: (typeof answered)[number]) => (isVoice ? (i.score ?? 0) / 100 : RESULT_CREDIT[(i.result ?? "wrong") as keyof typeof RESULT_CREDIT]);
  const passed = (i: (typeof answered)[number]) => (isVoice ? (i.score ?? 0) >= rules.voice.passScore : creditOf(i) > 0);
  let maxStreak = 0;
  let run = 0;
  for (const i of answered) {
    if (passed(i)) maxStreak = Math.max(maxStreak, ++run);
    else run = 0;
  }
  const correct = answered.filter((i) => (isVoice ? passed(i) : i.result === "correct")).length;
  const partial = isVoice ? 0 : answered.filter((i) => i.result === "accent" || i.result === "typo").length;
  const accuracy = answered.length ? answered.reduce((t, i) => t + creditOf(i), 0) / answered.length : 0;
  const acc = answered.filter((i) => !isVoice && creditOf(i) > 0);
  const avgSpeed = acc.length ? acc.reduce((t, i) => t + (i.speed ?? 0), 0) / acc.length : 0;
  const rankWeight = answered.length ? answered.reduce((t, i) => t + ITEM_BY_ID.get(i.itemId)!.rankWeight, 0) / answered.length : 0.7;
  const ctx = { answered: answered.length, target: session.targetCount, rankWeight };
  let rankPoints = isVoice
    ? voiceRankPoints(answered.map((i) => i.score ?? 0), ctx, rules)
    : typingRankPoints(answered.map((i) => ({ credit: creditOf(i), speed: i.speed ?? 0, points: i.points })), ctx, rules);
  const rankEligible = session.kind === "ranked" && answered.length > 0;
  if (!rankEligible) rankPoints = 0;
  const rankNote =
    session.kind === "practice" ? "Sessões de prática não contam para o ranking." : session.kind === "placement" ? "Teste de nivelamento não conta para o ranking." : answered.length ? null : "Nenhum exercício respondido.";

  // XP com retorno decrescente (acertos do mesmo item nas últimas 20 h)
  let itemsXp = 0;
  for (const i of answered) {
    const credit = isVoice ? (passed(i) ? creditOf(i) : 0) : creditOf(i);
    const p = (s.progress[i.itemId] ??= { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0, correct: 0, wrong: 0, dueAt: now, lastCorrectAt: [] });
    const recent = p.lastCorrectAt.filter((t) => now - t < 20 * 3600_000).length;
    i.xp = itemXp(credit, ITEM_BY_ID.get(i.itemId)!.difficulty, recent, rules);
    itemsXp += i.xp;
    if (credit > 0) p.lastCorrectAt = [...p.lastCorrectAt.slice(-5), now];
  }
  const completed = session.durationSeconds ? !!session.timerStartedAt && answered.length > 0 : answered.length >= Math.ceil(session.targetCount * 0.8);
  const completionBonus = completed && accuracy >= 0.5 && session.kind !== "placement" ? rules.xp.completionBonus : 0;

  // Revisão espaçada
  const seen = new Set<number>();
  for (const i of answered) {
    if (seen.has(i.itemId)) continue;
    seen.add(i.itemId);
    const p = s.progress[i.itemId];
    const q = isVoice ? qualityFromVoice(i.score ?? 0) : qualityFromTyping(i.result!, i.speed ?? 0);
    const n = nextReview(p, q, new Date(now));
    Object.assign(p, { ease: n.ease, intervalDays: n.intervalDays, reps: n.reps, lapses: n.lapses, dueAt: n.dueAt.getTime() });
    if (q >= 3) p.correct++;
    else p.wrong++;
  }

  let placementLevel: string | null = null;
  if (session.kind === "placement" && answered.length) {
    placementLevel = "A1";
    for (const lvl of ["A1", "A2", "B1", "B2"]) {
      const of = answered.filter((i) => ITEM_BY_ID.get(i.itemId)!.level === lvl);
      if (!of.length) break;
      if (of.reduce((t, i) => t + creditOf(i), 0) / of.length >= 0.6) placementLevel = lvl;
      else break;
    }
    s.user!.levels[session.language] = placementLevel;
  }

  const startedMs = session.timerStartedAt ?? session.startedAt;
  const last = answered.reduce((mx, i) => Math.max(mx, i.answeredAt ?? 0), 0);
  const studySeconds = answered.length ? Math.max(0, Math.min(session.durationSeconds ? session.durationSeconds + 45 : 1800, Math.round((Math.max(last, startedMs) - startedMs) / 1000))) : 0;
  const levelBefore = levelFromXp(s.stats.xp);
  const prevBest = Math.max(0, ...Object.values(s.sessions).filter((x) => x.status === "finished" && x.mode === session.mode).map((x) => Number(x.result?.rankPoints ?? 0)));

  const today = todayLocal(now);
  if (answered.length) {
    const st = s.stats;
    if (st.lastStudyDate !== today) {
      const y = todayLocal(now - 86_400_000);
      st.currentStreak = st.lastStudyDate === y ? st.currentStreak + 1 : 1;
    }
    st.longestStreak = Math.max(st.longestStreak, st.currentStreak);
    st.lastStudyDate = today;
    st.studySeconds += studySeconds;
    st.sessionsCount++;
    st.answered += answered.length;
    st.correct += correct + partial;
    st.bestAnswerStreak = Math.max(st.bestAnswerStreak, maxStreak);
  }
  session.status = "finished";
  session.finishedAt = now;
  const sessionXp = itemsXp + completionBonus;
  s.xpEvents.push({ at: now, amount: sessionXp, source: "session", ref: session.id });

  // Conquistas
  const finished = Object.values(s.sessions).filter((x) => x.status === "finished" && x.items.some((i) => i.result && !i.excluded));
  const newCodes = answered.length
    ? evaluateAchievements(
        {
          sessionsCount: s.stats.sessionsCount,
          currentStreak: s.stats.currentStreak,
          level: levelFromXp(s.stats.xp + sessionXp),
          learnedItems: Object.values(s.progress).filter((p) => p.reps >= 2).length,
          modesPlayed: new Set(finished.map((x) => x.mode)),
          languagesPlayed: new Set(finished.map((x) => x.language)).size,
          session: { mode: session.mode, kind: session.kind, answered: answered.length, accuracy, maxStreak, avgSpeed },
        },
        new Set(Object.keys(s.achievements)),
      )
    : [];
  const achievements = newCodes.map((code) => {
    const a = ACHIEVEMENTS.find((x) => x.code === code)!;
    s.achievements[code] = now;
    s.xpEvents.push({ at: now, amount: a.xp_reward, source: "achievement", ref: code });
    return { code, name: a.name_pt, icon: a.icon, xp: a.xp_reward };
  });

  // Desafios do dia
  const activity = dayActivity(s, today);
  const challenges = dailyChallenges(today)
    .filter((def) => challengeProgress(def, activity).done && !s.challenges[`${today}:${def.code}`])
    .map((def) => {
      s.challenges[`${today}:${def.code}`] = now;
      s.xpEvents.push({ at: now, amount: def.xp, source: "challenge", ref: def.code });
      return { code: def.code, title: def.title, xp: def.xp };
    });

  const achXp = achievements.reduce((t, a) => t + a.xp, 0);
  const chXp = challenges.reduce((t, c) => t + c.xp, 0);
  const total = sessionXp + achXp + chXp;
  s.stats.xp += total;
  session.result = {
    sessionId: session.id,
    mode: session.mode,
    kind: session.kind,
    rawScore: answered.reduce((t, i) => t + i.points, 0),
    rankPoints,
    rankEligible,
    rankNote,
    xp: { items: itemsXp, completionBonus, achievements: achXp, challenges: chXp, weeklyGoal: 0, total },
    answered: answered.length,
    correct,
    partial,
    wrong: answered.length - correct - partial,
    accuracy,
    maxStreak,
    avgSpeed,
    studySeconds,
    levelBefore,
    levelAfter: levelFromXp(s.stats.xp),
    achievements,
    challenges,
    weeklyGoalReached: false,
    placementLevel,
    newRecord: rankEligible && rankPoints > prevBest && prevBest > 0,
    endReason,
  };
  return session.result;
}

export function dayActivity(s: DemoState, day: string) {
  const list = Object.values(s.sessions).filter((x) => x.status === "finished" && x.finishedAt && todayLocal(x.finishedAt) === day);
  const withAnswers = list.filter((x) => x.items.some((i) => i.result && !i.excluded));
  return {
    sessions: withAnswers.length,
    typingSessions: withAnswers.filter((x) => x.mode === "typing").length,
    voiceSessions: withAnswers.filter((x) => x.mode === "voice").length,
    listenSessions: withAnswers.filter((x) => x.format === "listen").length,
    correct: list.reduce((t, x) => t + Number(x.result?.correct ?? 0) + Number(x.result?.partial ?? 0), 0),
    reviews: list.reduce((t, x) => t + x.items.filter((i) => i.isReview && i.result && !i.excluded).length, 0),
    bestStreak: Math.max(0, ...list.map((x) => Number(x.result?.maxStreak ?? 0))),
  };
}
