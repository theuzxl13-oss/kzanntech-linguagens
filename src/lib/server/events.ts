import { query, type Queryable } from "./db";

/** Registra eventos técnicos (consultáveis em Admin → Registros). Nunca lança erro. */
export async function logEvent(
  level: "info" | "warn" | "error",
  source: string,
  message: string,
  context?: Record<string, unknown>,
  userId?: string | null,
): Promise<void> {
  try {
    await query(`insert into app_events (level, source, message, context, user_id) values ($1,$2,$3,$4,$5)`, [
      level,
      source.slice(0, 100),
      message.slice(0, 1000),
      context ? JSON.stringify(context) : null,
      userId ?? null,
    ]);
  } catch (err) {
    console.error("[events] falha ao registrar evento", err);
  }
  if (level === "error") console.error(`[${source}] ${message}`, context ?? "");
}

/** Auditoria de operações administrativas e sensíveis. */
export async function audit(
  actorId: string | null,
  action: string,
  target: { type?: string; id?: string | number } = {},
  details?: Record<string, unknown>,
  ip?: string | null,
  client?: Queryable,
): Promise<void> {
  await query(
    `insert into audit_logs (actor_id, action, target_type, target_id, details, ip) values ($1,$2,$3,$4,$5,$6)`,
    [actorId, action, target.type ?? null, target.id != null ? String(target.id) : null, details ? JSON.stringify(details) : null, ip ?? null],
    client,
  );
}
