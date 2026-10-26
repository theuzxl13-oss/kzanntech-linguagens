import type { getSessionView, Prompt } from "@/lib/server/game/sessions";

export type SessionView = Awaited<ReturnType<typeof getSessionView>>;
export type { Prompt };
export interface Totals {
  score: number;
  answered: number;
  correct: number;
  streak: number;
}
export interface Solution {
  expected: string;
  text: string;
  translation: string;
  explanation: string | null;
}
export interface TimerInfo {
  startedAt: string | Date;
  endsAt: string | Date;
  serverNow?: string | Date;
}
