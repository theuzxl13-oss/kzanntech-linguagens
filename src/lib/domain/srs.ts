/**
 * Revisão espaçada (variação simplificada do SM-2).
 * Qualidade 0..5: ≥3 conta como lembrança bem-sucedida.
 */
export interface SrsState {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
}

export interface SrsUpdate extends SrsState {
  dueAt: Date;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

export function nextReview(state: SrsState, quality: number, now: Date = new Date()): SrsUpdate {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { ease, intervalDays, reps, lapses } = state;
  if (q < 3) {
    reps = 0;
    lapses += 1;
    intervalDays = 0;
    ease = Math.max(1.3, ease - 0.2);
    return { ease: round2(ease), intervalDays, reps, lapses, dueAt: new Date(now.getTime() + 10 * MINUTE) };
  }
  reps += 1;
  if (reps === 1) intervalDays = 1;
  else if (reps === 2) intervalDays = 3;
  else intervalDays = Math.min(180, Math.round(intervalDays * ease * 10) / 10);
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { ease: round2(ease), intervalDays, reps, lapses, dueAt: new Date(now.getTime() + intervalDays * DAY) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Converte o resultado de um exercício em qualidade SM-2. */
export function qualityFromTyping(result: string, speed: number): number {
  switch (result) {
    case "correct":
      return speed >= 0.8 ? 5 : 4;
    case "accent":
    case "typo":
      return 3;
    default:
      return 1;
  }
}

export function qualityFromVoice(score: number): number {
  if (score >= 85) return 5;
  if (score >= 70) return 4;
  if (score >= 60) return 3;
  return 1;
}

/** Um item é considerado "aprendido" após 2 revisões bem-sucedidas consecutivas. */
export const LEARNED_MIN_REPS = 2;
