import { DEFAULT_RULES, scoringRulesSchema, type ScoringRules } from "../domain/scoring";
import { query, queryOne, type Queryable } from "./db";

let cached: { rules: ScoringRules; at: number } | null = null;

/** Regras de pontuação vigentes (app_settings.scoring sobrescreve os padrões). Cache de 30s. */
export async function getScoringRules(client?: Queryable): Promise<ScoringRules> {
  if (cached && Date.now() - cached.at < 30_000) return cached.rules;
  const row = await queryOne<{ value: unknown }>(`select value from app_settings where key = 'scoring'`, [], client);
  let rules = DEFAULT_RULES;
  if (row) {
    const parsed = scoringRulesSchema.safeParse(row.value);
    if (parsed.success) rules = parsed.data;
  }
  cached = { rules, at: Date.now() };
  return rules;
}

export async function saveScoringRules(rules: ScoringRules, actorId: string, client?: Queryable) {
  const current = await getScoringRules(client);
  const next = { ...rules, version: current.version + 1 };
  await query(
    `insert into app_settings (key, value, updated_by, updated_at) values ('scoring', $1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [JSON.stringify(next), actorId],
    client,
  );
  cached = null;
  return next;
}

export function invalidateRulesCache() {
  cached = null;
}
