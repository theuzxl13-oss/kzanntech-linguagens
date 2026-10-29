/**
 * Trilha de aprendizado: lições = unidades (nível + tema) em ordem pedagógica.
 * Cada lição apresenta o conteúdo e depois pratica em dificuldade crescente:
 *   1. reconhecer a tradução (múltipla escolha, idioma → português)
 *   2. escolher a forma correta no idioma (múltipla escolha, português → idioma)
 *   3. escrever no idioma com dica (só frases curtas e palavras, até 5 itens)
 * Erros voltam para o fim da fila até serem acertados (aprendizagem para o domínio).
 */

export interface LessonItem {
  id: number;
  text: string;
  translation: string;
  explanation: string | null;
  kind: string;
  altTarget: string[];
  altPt: string[];
}

export interface LessonData {
  unitId: number;
  title: string;
  icon: string;
  level: string;
  position: number; // 1-based na trilha
  total: number;
  language: { code: string; name: string; flag: string; locale: string };
  items: LessonItem[];
  distractors: { pt: string[]; target: string[] };
  completed: boolean;
  nextUnitId: number | null;
}

/** "premium": lição fora do que o plano atual libera (ver domain/entitlements.ts). */
export type LessonStatus = "completed" | "available" | "locked" | "premium";

export interface PathLesson {
  unitId: number;
  title: string;
  icon: string;
  level: string;
  itemCount: number;
  position: number;
  status: LessonStatus;
  bestAccuracy: number | null;
}

export interface UnitForPath {
  unitId: number;
  title: string;
  icon: string;
  level: string;
  levelOrder: number;
  itemCount: number;
}

/**
 * Desbloqueio: a primeira lição está sempre disponível; as demais liberam quando a anterior é concluída.
 * Lições de nível abaixo do nível declarado pelo aluno ficam disponíveis (ele já domina a base).
 * Lições de nível não liberado pelo plano (`levelAllowed`) aparecem como "premium".
 */
export function buildPath(
  units: UnitForPath[],
  completed: Map<number, number>,
  userLevelOrder: number,
  levelAllowed: (level: string) => boolean = () => true,
): PathLesson[] {
  const lessons: PathLesson[] = [];
  units.forEach((u, i) => {
    const done = completed.has(u.unitId);
    const prevDone = i === 0 || completed.has(units[i - 1].unitId);
    const status: LessonStatus = !levelAllowed(u.level)
      ? "premium"
      : done
        ? "completed"
        : prevDone || u.levelOrder < userLevelOrder
          ? "available"
          : "locked";
    lessons.push({
      unitId: u.unitId,
      title: u.title,
      icon: u.icon,
      level: u.level,
      itemCount: u.itemCount,
      position: i + 1,
      status,
      bestAccuracy: done ? completed.get(u.unitId)! : null,
    });
  });
  return lessons;
}

export function nextLesson(path: PathLesson[]): PathLesson | null {
  return path.find((l) => l.status === "available") ?? null;
}

export type Exercise =
  | { type: "choose_pt"; itemId: number; prompt: string; options: string[]; answer: string }
  | { type: "choose_target"; itemId: number; prompt: string; options: string[]; answer: string }
  | { type: "write"; itemId: number; prompt: string; hint: string; answer: string };

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Opções de múltipla escolha: distratores de tamanho parecido com a resposta certa
 * (palavra com palavras, frase com frases), para que a resposta não fique óbvia.
 */
function options(correct: string, pool: string[], rnd: () => number): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[.!?¿¡]/g, "").trim();
  const words = (s: string) => s.trim().split(/\s+/).length;
  const others = [...new Set(pool.filter((p) => norm(p) !== norm(correct)))];
  const closest = shuffle(others, rnd)
    .sort((x, y) => Math.abs(words(x) - words(correct)) - Math.abs(words(y) - words(correct)) || Math.abs(x.length - correct.length) - Math.abs(y.length - correct.length))
    .slice(0, 4);
  return shuffle([correct, ...shuffle(closest, rnd).slice(0, 3)], rnd);
}

/** Dica para escrever: primeira letra de cada palavra e o tamanho (ex.: "I l___ l_______"). */
export function writingHint(answer: string): string {
  return answer
    .split(/\s+/)
    .map((w) => {
      const letters = [...w];
      const first = letters.findIndex((c) => /\p{L}|\p{N}/u.test(c));
      return letters.map((c, i) => (i === first || !/\p{L}/u.test(c) ? c : "_")).join("");
    })
    .join(" ");
}

export function buildExercises(lesson: Pick<LessonData, "items" | "distractors">, rnd: () => number = Math.random): Exercise[] {
  const ptPool = [...lesson.items.map((i) => i.translation), ...lesson.distractors.pt];
  const targetPool = [...lesson.items.map((i) => i.text), ...lesson.distractors.target];
  const items = shuffle(lesson.items, rnd);
  const recognize: Exercise[] = items.map((i) => ({ type: "choose_pt", itemId: i.id, prompt: i.text, options: options(i.translation, ptPool, rnd), answer: i.translation }));
  const choose: Exercise[] = shuffle(items, rnd).map((i) => ({
    type: "choose_target",
    itemId: i.id,
    prompt: i.translation,
    options: options(i.text, targetPool, rnd),
    answer: i.text,
  }));
  const writable = shuffle(items, rnd)
    .sort((a, b) => a.text.length - b.text.length)
    .slice(0, Math.min(5, items.length));
  const write: Exercise[] = writable.map((i) => ({ type: "write", itemId: i.id, prompt: i.translation, hint: writingHint(i.text), answer: i.text }));
  return [...recognize, ...choose, ...write];
}

/** Estrelas da lição pela precisão na primeira tentativa de cada exercício. */
export function lessonStars(accuracy: number): number {
  if (accuracy >= 0.9) return 3;
  if (accuracy >= 0.7) return 2;
  return 1;
}

/** XP de lição: primeira conclusão vale mais; repetir para fixar rende um pouco (uma vez por dia). */
export const LESSON_XP = { first: 25, repeat: 5, dailyCap: 150 } as const;

/** Número de exercícios gerados para uma lição com `items` itens (ver buildExercises). */
export function exerciseCount(items: number): number {
  return items * 2 + Math.min(5, items);
}

/** Tempo mínimo (s) entre iniciar e concluir uma lição: ~2 s por exercício, no mínimo 10 s. */
export function minLessonSeconds(items: number): number {
  return Math.max(10, exerciseCount(items) * 2);
}
