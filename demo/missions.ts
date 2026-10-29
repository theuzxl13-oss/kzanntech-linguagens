/**
 * Missões de diálogo na DEMONSTRAÇÃO: mesma avaliação, dicas, pontuação e XP do app
 * (src/lib/domain/missions.ts), com o estado no navegador. Sem proteções antifraude.
 */
import { MISSIONS, MISSION_SPECS } from "../db/seed/missions";
import {
  MAX_ANSWER_LENGTH,
  MAX_TRIES_PER_STEP,
  REGIONS,
  evaluateStep,
  hintText,
  missionStatus,
  missionXp,
  stepScore,
  type MissionSpec,
} from "@/lib/domain/missions";
import { ITEMS, UNITS, todayLocal, type DemoState } from "./store";

export interface DemoMissionTurn {
  step: number;
  tryNo: number;
  text: string;
  passed: boolean;
  feedback: string[];
  grammar: boolean;
  response: Record<string, unknown>;
}

export interface DemoMissionAttempt {
  id: string;
  missionId: string;
  status: "in_progress" | "completed";
  step: number;
  hints: number[];
  turns: DemoMissionTurn[];
  score: number | null;
  summary: Record<string, unknown> | null;
  startedAt: number;
}

type WithMissions = DemoState & { missions?: Record<string, DemoMissionAttempt> };

function missionsFor(language: string) {
  const specs = MISSION_SPECS[language as keyof typeof MISSION_SPECS];
  if (!specs) return [];
  return MISSIONS.map((m) => ({
    id: `${language}-${m.slug}`,
    language,
    title: m.title,
    region: m.region,
    level: m.level,
    requiresMission: m.requiresSlug ? `${language}-${m.requiresSlug}` : null,
    requiresLessons: m.requiresLessons,
    spec: specs[m.slug] as MissionSpec,
  }));
}

function findMission(id: string) {
  const lang = id.split("-")[0];
  return missionsFor(lang).find((m) => m.id === id) ?? null;
}

function lessonsDone(s: DemoState, language: string) {
  return Object.keys(s.lessons ?? {}).filter((id) => UNITS.get(Number(id))?.language === language).length;
}

function attempts(s: WithMissions) {
  s.missions ??= {};
  return s.missions;
}

function completedSet(s: WithMissions) {
  return new Set(Object.values(attempts(s)).filter((a) => a.status === "completed").map((a) => a.missionId));
}

export function demoListMissions(s: WithMissions, language: string) {
  const all = missionsFor(language);
  const done = completedSet(s);
  const lessons = lessonsDone(s, language);
  const atts = Object.values(attempts(s));
  const items = all.map((m) => {
    const status = missionStatus(m, done, lessons);
    const open = atts.find((a) => a.missionId === m.id && a.status === "in_progress");
    const scores = atts.filter((a) => a.missionId === m.id && a.status === "completed").map((a) => a.score ?? 0);
    const req = m.requiresMission ? all.find((x) => x.id === m.requiresMission) : null;
    return {
      id: m.id,
      title: m.title,
      region: m.region,
      level: m.level,
      characterName: m.spec.characterName,
      contextPt: m.spec.contextPt,
      objectivePt: m.spec.objectivePt,
      steps: m.spec.steps.length,
      status,
      reviewed: false,
      bestScore: scores.length ? Math.max(...scores) : null,
      inProgress: open ? { attemptId: open.id, step: open.step } : null,
      unlockHint:
        status === "locked"
          ? [req && !done.has(req.id) ? `conclua a missão "${req.title}"` : null, lessons < m.requiresLessons ? `conclua ${m.requiresLessons} lição(ões) da trilha (${lessons} até agora)` : null]
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

export function demoStartMission(s: WithMissions, missionId: string) {
  const m = findMission(missionId);
  if (!m) throw new Error("Missão não encontrada.");
  if (missionStatus(m, completedSet(s), lessonsDone(s, m.language)) === "locked") throw new Error("Esta missão ainda está bloqueada.");
  const open = Object.values(attempts(s)).find((a) => a.missionId === missionId && a.status === "in_progress");
  if (open) return { attemptId: open.id };
  const id = crypto.randomUUID();
  attempts(s)[id] = { id, missionId, status: "in_progress", step: 0, hints: [], turns: [], score: null, summary: null, startedAt: Date.now() };
  return { attemptId: id };
}

export function demoAttemptView(s: WithMissions, attemptId: string) {
  const a = attempts(s)[attemptId];
  if (!a) return null;
  const m = findMission(a.missionId)!;
  const spec = m.spec;
  const transcript = spec.steps.slice(0, Math.min(a.step + 1, spec.steps.length)).map((st, i) => {
    const ts = a.turns.filter((t) => t.step === i);
    const done = i < a.step;
    const passed = ts.some((t) => t.passed);
    return {
      npc: st.npc,
      npcPt: st.npcPt,
      turns: ts.map((t) => ({ text: t.text, passed: t.passed, feedback: t.feedback })),
      reply: done && passed ? { text: st.reply, pt: st.replyPt } : null,
      model: done && !passed ? st.model : null,
    };
  });
  const cur = a.status === "in_progress" ? spec.steps[a.step] : null;
  const level = a.hints[a.step] ?? 0;
  return {
    attemptId: a.id,
    status: a.status,
    mission: {
      id: m.id,
      title: m.title,
      level: m.level,
      language: m.language,
      characterName: spec.characterName,
      characterRole: spec.characterRole,
      contextPt: spec.contextPt,
      objectivePt: spec.objectivePt,
      structures: spec.structures,
      totalSteps: spec.steps.length,
      reviewed: false,
    },
    transcript,
    current: cur
      ? { step: a.step, goalPt: cur.goalPt, tryNo: transcript[a.step].turns.length + 1, hintLevel: level, hints: [1, 2, 3].filter((l) => l <= level).map((l) => hintText(cur, l)) }
      : null,
    summary: a.summary,
  };
}

export function demoHint(s: WithMissions, attemptId: string, step: number) {
  const a = attempts(s)[attemptId];
  if (!a || a.status !== "in_progress" || step !== a.step) throw new Error("Etapa fora de sequência. Recarregue a missão.");
  const level = Math.min(3, (a.hints[step] ?? 0) + 1);
  for (let i = 0; i <= step; i++) a.hints[i] ??= 0;
  a.hints[step] = level;
  const st = findMission(a.missionId)!.spec.steps[step];
  return { level, hints: [1, 2, 3].filter((l) => l <= level).map((l) => hintText(st, l)) };
}

export function demoAnswer(s: WithMissions, attemptId: string, input: { step: number; tryNo: number; text: string }) {
  const a = attempts(s)[attemptId];
  if (!a) throw new Error("Missão não encontrada.");
  const replay = a.turns.find((t) => t.step === input.step && t.tryNo === input.tryNo);
  if (replay) return { ...replay.response, replayed: true };
  if (a.status !== "in_progress" || input.step !== a.step) throw new Error("Etapa fora de sequência. Recarregue a missão.");
  const m = findMission(a.missionId)!;
  const st = m.spec.steps[input.step];
  const text = String(input.text ?? "").trim().slice(0, MAX_ANSWER_LENGTH);
  const ev = evaluateStep(st, text, m.language);
  const outOfTries = !ev.passed && input.tryNo >= MAX_TRIES_PER_STEP;
  const advance = ev.passed || outOfTries;
  const turn: DemoMissionTurn = { step: input.step, tryNo: input.tryNo, text, passed: ev.passed, feedback: ev.feedback, grammar: ev.grammar.length > 0, response: {} };
  a.turns.push(turn);
  if (advance) a.step += 1;
  const finished = a.step >= m.spec.steps.length;
  const summary = finished ? finalize(s, a, m) : null;
  turn.response = {
    passed: ev.passed,
    feedback: ev.feedback,
    missing: ev.missing,
    grammar: ev.grammar,
    bonusMissing: ev.bonusMissing,
    reply: ev.passed ? { text: st.reply, pt: st.replyPt } : null,
    model: outOfTries ? st.model : null,
    triesLeft: advance ? 0 : MAX_TRIES_PER_STEP - input.tryNo,
    advanced: advance,
    finished,
    summary,
    replayed: false,
  };
  return turn.response;
}

function finalize(s: WithMissions, a: DemoMissionAttempt, m: NonNullable<ReturnType<typeof findMission>>) {
  const spec = m.spec;
  const steps = spec.steps.map((st, i) => {
    const ts = a.turns.filter((t) => t.step === i);
    const passed = ts.some((t) => t.passed);
    const score = stepScore(passed, ts.length, a.hints[i] ?? 0, ts.some((t) => t.passed && t.grammar));
    const notes = [...new Set(ts.flatMap((t) => t.feedback).filter((f) => !/^Mensagem entendida|^Ainda falta|^Escreva uma resposta/.test(f)))];
    return { st, score, last: ts[ts.length - 1], notes };
  });
  const score = Math.round((steps.reduce((acc, x) => acc + x.score, 0) / steps.length) * 1000) / 1000;
  const firstCompletion = !Object.values(attempts(s)).some((x) => x.id !== a.id && x.missionId === a.missionId && x.status === "completed");
  const now = Date.now();
  const today = todayLocal();
  const last24 = s.xpEvents.filter((e) => e.source === "mission" && e.at > now - 86_400_000).reduce((acc, e) => acc + e.amount, 0);
  const ref = firstCompletion ? m.id : `${m.id}:${today}`;
  const already = s.xpEvents.some((e) => e.source === "mission" && e.ref === ref);
  const xp = already ? 0 : missionXp(score, firstCompletion, last24);
  if (xp) s.xpEvents.push({ at: now, amount: xp, source: "mission", ref });
  s.stats.xp += xp;
  if (s.stats.lastStudyDate !== today) {
    s.stats.currentStreak = s.stats.lastStudyDate === todayLocal(now - 86_400_000) ? s.stats.currentStreak + 1 : 1;
    s.stats.longestStreak = Math.max(s.stats.longestStreak, s.stats.currentStreak);
    s.stats.lastStudyDate = today;
  }
  // Revisão espaçada: desempenho fraco coloca o vocabulário da missão para revisar agora
  const weak = steps.some((x) => x.score < 0.7);
  const vocab = new Set(spec.vocab.map((v) => v.toLowerCase()));
  const ids = ITEMS.filter((i) => i.language === m.language && vocab.has(i.text.toLowerCase())).map((i) => i.id);
  let reviewScheduled = 0;
  for (const id of ids) {
    const p = (s.progress[id] ??= { ease: 2.5, intervalDays: 1, reps: weak ? 0 : 1, lapses: 0, correct: 0, wrong: 0, dueAt: now + 86_400_000, lastCorrectAt: [] });
    if (weak) {
      p.dueAt = Math.min(p.dueAt, now);
      reviewScheduled++;
    }
  }
  const done = completedSet(s);
  done.add(m.id);
  const lessons = lessonsDone(s, m.language);
  const next = missionsFor(m.language).find((x) => x.id !== m.id && missionStatus(x, done, lessons) === "available") ?? null;
  const weakest = [...steps].sort((x, y) => x.score - y.score)[0];
  const summary = {
    score,
    xp,
    firstCompletion,
    learnedPt: spec.learnedPt,
    wellDone: steps.filter((x) => x.score >= 0.85).map((x) => x.st.goalPt),
    corrections: steps.filter((x) => x.score < 0.85).map((x) => ({ goalPt: x.st.goalPt, answer: x.last?.text ?? "", notes: x.notes, model: x.st.model })),
    practice: weakest && weakest.score < 1 ? { phrase: weakest.st.model, goalPt: weakest.st.goalPt } : null,
    reviewScheduled,
    next: next ? { id: next.id, title: next.title } : null,
  };
  a.status = "completed";
  a.score = score;
  a.summary = summary;
  return summary;
}
