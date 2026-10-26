/**
 * Estado e catálogo da DEMONSTRAÇÃO estática (sem servidor nem banco).
 * O conteúdo é o mesmo do seed real (db/seed/content.ts); o progresso fica no localStorage
 * deste navegador. Nada aqui é usado pela aplicação de produção.
 */
import { ACHIEVEMENTS, CATEGORIES, CONCEPTS, LANGUAGES, LEVELS, type Translation } from "../db/seed/content";

export interface DemoItem {
  id: number;
  language: string;
  category: string;
  categoryName: string;
  icon: string;
  level: string;
  levelOrder: number;
  difficulty: number;
  rankWeight: number;
  kind: string;
  text: string;
  translation: string;
  explanation: string | null;
  altTarget: string[];
  altPt: string[];
  unitId: number;
}

function unpack(tr: Translation) {
  return typeof tr === "string" ? { t: tr, alt: [] as string[], pt: [] as string[], note: undefined as string | undefined } : { alt: [], pt: [], ...tr };
}

const levelInfo = new Map<string, (typeof LEVELS)[number]>(LEVELS.map((l) => [l.code, l]));
const catInfo = new Map<string, (typeof CATEGORIES)[number]>(CATEGORIES.map((c) => [c.slug, c]));

export const ITEMS: DemoItem[] = [];
export const UNITS = new Map<number, { id: number; language: string; level: string; category: string; title: string; icon: string }>();
CONCEPTS.forEach((c, ci) => {
  LANGUAGES.forEach((l, li) => {
    const tr = unpack(c.tr[l.code]);
    const lv = levelInfo.get(c.level)!;
    const cat = catInfo.get(c.cat)!;
    const unitId = (li + 1) * 1000 + lv.sort_order * 100 + cat.sort_order;
    if (!UNITS.has(unitId)) UNITS.set(unitId, { id: unitId, language: l.code, level: c.level, category: c.cat, title: `${cat.name_pt} · ${c.level}`, icon: cat.icon });
    ITEMS.push({
      id: ci * 10 + li + 1,
      language: l.code,
      category: c.cat,
      categoryName: cat.name_pt,
      icon: cat.icon,
      level: c.level,
      levelOrder: lv.sort_order,
      difficulty: lv.difficulty,
      rankWeight: lv.rank_weight,
      kind: c.kind,
      text: tr.t,
      translation: c.pt,
      explanation: tr.note ?? null,
      altTarget: tr.alt,
      altPt: [...(c.ptAlt ?? []), ...tr.pt],
      unitId,
    });
  });
});
export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export { ACHIEVEMENTS, CATEGORIES, LANGUAGES, LEVELS };

export interface DemoSessionItem {
  itemId: number;
  format: "translate" | "write" | "listen" | "speak";
  isReview: boolean;
  servedAt: number | null;
  answeredAt: number | null;
  attempts: number;
  excluded: boolean;
  result: string | null;
  score: number | null;
  points: number;
  speed: number | null;
  xp: number;
  firstAnswer: string | null;
  answers: Record<number, unknown>;
}

export interface DemoSession {
  id: string;
  language: string;
  mode: "typing" | "voice";
  format: string;
  kind: "ranked" | "practice" | "placement";
  preset: string;
  durationSeconds: number | null;
  targetCount: number;
  status: "active" | "finished";
  startedAt: number;
  timerStartedAt: number | null;
  expiresAt: number;
  finishedAt: number | null;
  items: DemoSessionItem[];
  result: Record<string, unknown> | null;
}

export interface DemoState {
  version: 1;
  user: {
    nickname: string;
    avatar: string;
    avatarColor: string;
    currentLanguage: string | null;
    levels: Record<string, string>;
    voiceConsent: boolean;
    weeklyGoalXp: number;
  } | null;
  stats: {
    xp: number;
    currentStreak: number;
    longestStreak: number;
    lastStudyDate: string | null;
    studySeconds: number;
    sessionsCount: number;
    answered: number;
    correct: number;
    bestAnswerStreak: number;
  };
  sessions: Record<string, DemoSession>;
  progress: Record<number, { ease: number; intervalDays: number; reps: number; lapses: number; correct: number; wrong: number; dueAt: number; lastCorrectAt: number[] }>;
  achievements: Record<string, number>;
  xpEvents: { at: number; amount: number; source: string; ref: string }[];
  challenges: Record<string, number>;
  lessons?: Record<number, { best: number; at: number; times: number; lastXpDay: string }>;
}

const KEY = "keylingo-demo-v1";

function empty(): DemoState {
  return {
    version: 1,
    user: null,
    stats: { xp: 0, currentStreak: 0, longestStreak: 0, lastStudyDate: null, studySeconds: 0, sessionsCount: 0, answered: 0, correct: 0, bestAnswerStreak: 0 },
    sessions: {},
    progress: {},
    achievements: {},
    xpEvents: [],
    challenges: {},
    lessons: {},
  };
}

let memory: DemoState | null = null;

export function load(): DemoState {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as DemoState) : empty();
  } catch {
    memory = empty();
  }
  return memory!;
}

export function save(state: DemoState) {
  memory = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* modo privado ou armazenamento cheio: a demo segue só em memória */
  }
  window.dispatchEvent(new Event("demo-refresh"));
}

export function resetDemo() {
  memory = empty();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorado */
  }
}

export function todayLocal(at = Date.now()) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Jogadores fictícios para os rankings da demonstração (claramente marcados como DEMO). */
export const DEMO_PLAYERS = [
  { nickname: "lia_demo", avatar: "cat", avatarColor: "teal", typing: [820, 790, 760, 700, 690, 650, 600, 580, 560, 520], voice: [700, 680, 650, 600, 560] },
  { nickname: "rafa_demo", avatar: "fox", avatarColor: "amber", typing: [900, 880, 850, 810], voice: [400, 380] },
  { nickname: "bia_demo", avatar: "panda", avatarColor: "rose", typing: [610, 600, 560], voice: [720, 700, 690, 650, 640, 610] },
  { nickname: "teo_demo", avatar: "owl", avatarColor: "sky", typing: [500, 480, 450, 430, 400], voice: [] },
  { nickname: "nina_demo", avatar: "rabbit", avatarColor: "lime", typing: [350, 330], voice: [380, 360, 300] },
  { nickname: "caio_demo", avatar: "bear", avatarColor: "violet", typing: [260, 240], voice: [200] },
];
