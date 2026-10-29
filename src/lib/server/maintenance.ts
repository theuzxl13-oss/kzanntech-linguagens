import { query } from "./db";

/**
 * Política de retenção (ver docs/PRIVACY.md). Executada por `npm run db:maintenance`
 * (agende diariamente) ou pelo painel administrativo.
 */
export const RETENTION = {
  rateLimitsHours: 24,
  appEventsDays: 90,
  emailOutboxDays: 30,
  expiredTokensDays: 7,
  auditLogsDays: 365,
  staleLessonAttemptsDays: 2,
} as const;

export async function runMaintenance() {
  const counts: Record<string, number> = {};
  const run = async (name: string, sql: string, params: unknown[]) => {
    counts[name] = (await query(`with d as (${sql} returning 1) select count(*)::int as n from d`, params))[0]?.n ?? 0;
  };
  await run("rate_limits", `delete from rate_limits where window_start < now() - make_interval(hours => $1)`, [RETENTION.rateLimitsHours]);
  await run("app_events", `delete from app_events where created_at < now() - make_interval(days => $1)`, [RETENTION.appEventsDays]);
  await run("email_outbox", `delete from email_outbox where created_at < now() - make_interval(days => $1)`, [RETENTION.emailOutboxDays]);
  await run("auth_tokens", `delete from auth_tokens where expires_at < now() - make_interval(days => $1)`, [RETENTION.expiredTokensDays]);
  await run("auth_sessions", `delete from auth_sessions where expires_at < now()`, []);
  await run("audit_logs", `delete from audit_logs where created_at < now() - make_interval(days => $1)`, [RETENTION.auditLogsDays]);
  await run("lesson_attempts", `delete from lesson_attempts where started_at < now() - make_interval(days => $1)`, [RETENTION.staleLessonAttemptsDays]);
  return counts;
}
