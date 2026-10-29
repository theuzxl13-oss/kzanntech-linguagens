/**
 * Ponto único que decide o que o usuário pode usar, a partir do estado das assinaturas no banco.
 * Nunca depende de informação enviada pelo navegador. Não há cache por usuário (evita exposição cruzada
 * e garante efeito imediato de cancelamentos); só a configuração global é cacheada por 30 s.
 */
import { DEFAULT_ENTITLEMENTS, entitlementsConfigSchema, subscriptionGrantsPremium, type EntitlementsConfig, type SubscriptionStatus, type Tier, type TierLimits } from "../domain/entitlements";
import { localDate } from "../domain/dates";
import { query, queryOne, type Queryable } from "./db";
import { HttpError } from "./errors";

let cached: { cfg: EntitlementsConfig; at: number } | null = null;

export async function getEntitlementsConfig(client?: Queryable): Promise<EntitlementsConfig> {
  if (cached && Date.now() - cached.at < 30_000) return cached.cfg;
  const row = await queryOne<{ value: unknown }>(`select value from app_settings where key = 'entitlements'`, [], client);
  const parsed = row ? entitlementsConfigSchema.safeParse(row.value) : null;
  cached = { cfg: parsed?.success ? parsed.data : DEFAULT_ENTITLEMENTS, at: Date.now() };
  return cached.cfg;
}

export async function saveEntitlementsConfig(cfg: EntitlementsConfig, actorId: string, client?: Queryable) {
  await query(
    `insert into app_settings (key, value, updated_by, updated_at) values ('entitlements', $1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [JSON.stringify(entitlementsConfigSchema.parse(cfg)), actorId],
    client,
  );
  cached = null;
}

export interface SubscriptionSummary {
  id: string;
  planCode: string;
  planName: string;
  provider: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  grantsPremium: boolean;
}

export interface Entitlements {
  tier: Tier;
  limits: TierLimits;
  subscription: SubscriptionSummary | null;
}

/** Assinaturas do usuário, da mais relevante para a menos relevante. */
export async function listSubscriptions(userId: string, client?: Queryable) {
  return query<{ id: string; plan_code: string; plan_name: string; plan_tier: Tier; provider: string; status: SubscriptionStatus; current_period_end: Date | null; cancel_at_period_end: boolean }>(
    `select s.id, s.plan_code, p.name as plan_name, p.tier as plan_tier, s.provider, s.status, s.current_period_end, s.cancel_at_period_end
       from subscriptions s join plans p on p.code = s.plan_code
      where s.user_id = $1
      order by (s.status in ('active','trialing','past_due')) desc, s.current_period_end desc nulls last, s.created_at desc
      limit 20`,
    [userId],
    client,
  );
}

export async function getEntitlements(userId: string, client?: Queryable, now = new Date()): Promise<Entitlements> {
  const [cfg, subs] = await Promise.all([getEntitlementsConfig(client), listSubscriptions(userId, client)]);
  let best: SubscriptionSummary | null = null;
  for (const s of subs) {
    const grants = s.plan_tier === "premium" && subscriptionGrantsPremium({ status: s.status, currentPeriodEnd: s.current_period_end }, now, cfg.pastDueGraceDays);
    const summary: SubscriptionSummary = {
      id: s.id,
      planCode: s.plan_code,
      planName: s.plan_name,
      provider: s.provider,
      status: s.status,
      currentPeriodEnd: s.current_period_end,
      cancelAtPeriodEnd: s.cancel_at_period_end,
      grantsPremium: grants,
    };
    if (grants) {
      best = summary;
      break;
    }
    best ??= summary;
  }
  const tier: Tier = best?.grantsPremium ? "premium" : "free";
  return { tier, limits: cfg[tier], subscription: best };
}

export const planRequired = (message: string, feature: string) => new HttpError(402, "plan_required", message, { feature, upgradeUrl: "/planos" });

export type UsageFeature = "voice_assessment" | "tts";

/**
 * Consome uma unidade da cota diária de um recurso com custo. Atômico: o incremento só acontece se
 * ainda houver cota, então requisições concorrentes não ultrapassam o limite.
 */
export async function consumeQuota(userId: string, feature: UsageFeature, client?: Queryable): Promise<{ used: number; limit: number }> {
  const ent = await getEntitlements(userId, client);
  const limit = feature === "tts" ? ent.limits.ttsPerDay : ent.limits.voiceAssessmentsPerDay;
  const tz = (await queryOne<{ timezone: string }>(`select timezone from profiles where user_id = $1`, [userId], client))?.timezone ?? "America/Sao_Paulo";
  const day = localDate(new Date(), tz);
  const row = await queryOne<{ count: number }>(
    `insert into usage_counters (user_id, feature, day, count) values ($1,$2,$3,1)
     on conflict (user_id, feature, day) do update set count = usage_counters.count + 1 where usage_counters.count < $4
     returning count`,
    [userId, feature, day, limit],
    client,
  );
  if (!row || limit === 0) {
    const what = feature === "tts" ? "áudios gerados no servidor" : "avaliações de pronúncia no servidor";
    throw new HttpError(429, "plan_limit", `Você atingiu o limite diário de ${what} do seu plano (${limit}). O limite renova amanhã.`, {
      feature,
      limit,
      tier: ent.tier,
      upgradeUrl: ent.tier === "free" ? "/planos" : undefined,
    });
  }
  return { used: row.count, limit };
}

export async function usageToday(userId: string, tz: string) {
  const rows = await query<{ feature: UsageFeature; count: number }>(`select feature, count from usage_counters where user_id = $1 and day = $2`, [userId, localDate(new Date(), tz)]);
  return Object.fromEntries(rows.map((r) => [r.feature, r.count])) as Partial<Record<UsageFeature, number>>;
}
