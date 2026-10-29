/**
 * Permissões por plano — ponto único de decisão sobre o que cada plano libera.
 * Limites são configuráveis (app_settings.entitlements); o plano gratuito mantém a experiência
 * básica completa: trilha inicial, jogos, revisão espaçada, metas e conquistas.
 */
import { z } from "zod";

export type Tier = "free" | "premium";

export const tierLimitsSchema = z.object({
  /** Nível CEFR mais alto liberado nas lições da trilha (ex.: "A2"). "C2" = todas. */
  lessonMaxLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  /** Avaliações de pronúncia no servidor por dia (custo por uso no provedor). */
  voiceAssessmentsPerDay: z.number().int().min(0).max(100_000),
  /** Áudios sintetizados no servidor por dia. */
  ttsPerDay: z.number().int().min(0).max(100_000),
  /** Página de estatísticas detalhadas. */
  detailedStats: z.boolean(),
});
export type TierLimits = z.infer<typeof tierLimitsSchema>;

export const entitlementsConfigSchema = z.object({
  free: tierLimitsSchema,
  premium: tierLimitsSchema,
  /** Dias de tolerância após falha de pagamento antes de perder o Premium. */
  pastDueGraceDays: z.number().int().min(0).max(30),
});
export type EntitlementsConfig = z.infer<typeof entitlementsConfigSchema>;

export const DEFAULT_ENTITLEMENTS: EntitlementsConfig = {
  free: { lessonMaxLevel: "A2", voiceAssessmentsPerDay: 20, ttsPerDay: 150, detailedStats: false },
  premium: { lessonMaxLevel: "C2", voiceAssessmentsPerDay: 300, ttsPerDay: 3000, detailedStats: true },
  pastDueGraceDays: 3,
};

const LEVEL_ORDER: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

export function lessonAllowed(level: string, limits: TierLimits): boolean {
  return (LEVEL_ORDER[level] ?? 99) <= LEVEL_ORDER[limits.lessonMaxLevel];
}

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired" | "incomplete";

export interface SubscriptionLike {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
}

/**
 * A assinatura dá acesso Premium agora?
 *  - active/trialing: até o fim do período pago;
 *  - past_due (pagamento falhou): tolerância de alguns dias após o fim do período;
 *  - canceled: acesso até o fim do período já pago;
 *  - expired/incomplete: sem acesso.
 */
export function subscriptionGrantsPremium(sub: SubscriptionLike | null, now: Date, graceDays: number): boolean {
  if (!sub || !sub.currentPeriodEnd) return false;
  const end = sub.currentPeriodEnd.getTime();
  switch (sub.status) {
    case "active":
    case "trialing":
    case "canceled":
      return now.getTime() < end;
    case "past_due":
      return now.getTime() < end + graceDays * 86_400_000;
    default:
      return false;
  }
}
