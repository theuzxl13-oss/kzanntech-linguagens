/** Trilha de aprendizado na DEMONSTRAÇÃO: mesma lógica do app (buildPath), dados locais. */
import { buildPath, LESSON_XP, type LessonData } from "@/lib/domain/lessons";
import { ITEMS, LANGUAGES, UNITS, todayLocal, type DemoState } from "./store";

const LEVEL_ORDER: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

export function demoPath(s: DemoState, language: string) {
  const units = [...UNITS.values()]
    .filter((u) => u.language === language)
    .sort((a, b) => a.id - b.id)
    .map((u) => ({
      unitId: u.id,
      title: u.title,
      icon: u.icon,
      level: u.level,
      levelOrder: LEVEL_ORDER[u.level],
      itemCount: ITEMS.filter((i) => i.unitId === u.id).length,
    }));
  const done = new Map(Object.entries(s.lessons ?? {}).map(([k, v]) => [Number(k), v.best]));
  const levelCode = s.user?.levels[language] ?? "A1";
  return { levelCode, lessons: buildPath(units, done, LEVEL_ORDER[levelCode] ?? 1) };
}

export function demoLesson(s: DemoState, unitId: number): LessonData | null {
  const unit = UNITS.get(unitId);
  if (!unit) return null;
  const { lessons } = demoPath(s, unit.language);
  const idx = lessons.findIndex((l) => l.unitId === unitId);
  if (idx === -1 || lessons[idx].status === "locked") return null;
  const lang = LANGUAGES.find((l) => l.code === unit.language)!;
  const items = ITEMS.filter((i) => i.unitId === unitId);
  const others = ITEMS.filter((i) => i.language === unit.language && i.unitId !== unitId && i.levelOrder <= LEVEL_ORDER[unit.level] + 1)
    .sort(() => Math.random() - 0.5)
    .slice(0, 30);
  return {
    unitId,
    title: unit.title,
    icon: unit.icon,
    level: unit.level,
    position: idx + 1,
    total: lessons.length,
    language: { code: lang.code, name: lang.name_pt, flag: lang.flag, locale: lang.locale },
    items: items.map((i) => ({ id: i.id, text: i.text, translation: i.translation, explanation: i.explanation, kind: i.kind, altTarget: i.altTarget, altPt: i.altPt })),
    distractors: { pt: others.map((o) => o.translation), target: others.map((o) => o.text) },
    completed: lessons[idx].status === "completed",
    nextUnitId: lessons[idx + 1]?.unitId ?? null,
  };
}

export function demoCompleteLesson(s: DemoState, unitId: number, accuracy: number) {
  const lesson = demoLesson(s, unitId);
  if (!lesson) throw new Error("Lição bloqueada");
  s.lessons ??= {};
  const today = todayLocal();
  const prev = s.lessons[unitId];
  let xp = 0;
  if (!prev) xp = LESSON_XP.first;
  else if (prev.lastXpDay !== today) xp = LESSON_XP.repeat;
  s.lessons[unitId] = {
    best: Math.max(prev?.best ?? 0, accuracy),
    at: Date.now(),
    times: (prev?.times ?? 0) + 1,
    lastXpDay: xp ? today : (prev?.lastXpDay ?? today),
  };
  const now = Date.now();
  for (const it of lesson.items) {
    s.progress[it.id] ??= { ease: 2.5, intervalDays: 1, reps: 1, lapses: 0, correct: 0, wrong: 0, dueAt: now + 86_400_000, lastCorrectAt: [] };
  }
  if (xp) s.xpEvents.push({ at: now, amount: xp, source: "lesson", ref: String(unitId) });
  s.stats.xp += xp;
  if (s.stats.lastStudyDate !== today) {
    s.stats.currentStreak = s.stats.lastStudyDate === todayLocal(now - 86_400_000) ? s.stats.currentStreak + 1 : 1;
    s.stats.longestStreak = Math.max(s.stats.longestStreak, s.stats.currentStreak);
    s.stats.lastStudyDate = today;
  }
  return { ok: true, xp, firstTime: !prev, nextUnitId: lesson.nextUnitId };
}
