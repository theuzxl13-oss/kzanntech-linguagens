import { createHmac, randomBytes } from "node:crypto";
import { config } from "./config";
import { query, queryOne, type Queryable } from "./db";

export const SESSION_COOKIE = "kl_session";
export const SESSION_DAYS = 30;

export interface CurrentUser {
  id: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  emailVerified: boolean;
  nickname: string;
  avatar: string;
  avatarColor: string;
  currentLanguage: string | null;
  timezone: string;
  ttsRate: number;
  autoplayAudio: boolean;
  showInRankings: boolean;
  weeklyGoalXp: number;
  voiceConsent: boolean;
  isDemo: boolean;
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Tokens nunca são guardados em texto puro: armazenamos um HMAC-SHA256. */
export function hashToken(token: string): string {
  return createHmac("sha256", config.authSecret).update(token).digest("hex");
}

export async function createAuthSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
  client?: Queryable,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query(`insert into auth_sessions (user_id, token_hash, expires_at, ip, user_agent) values ($1,$2,$3,$4,$5)`, [
    userId,
    hashToken(token),
    expiresAt,
    meta.ip ?? null,
    meta.userAgent?.slice(0, 300) ?? null,
  ], client);
  return { token, expiresAt };
}

const USER_COLUMNS = `
  u.id, u.email, u.role, u.status, (u.email_verified_at is not null) as "emailVerified",
  p.nickname, p.avatar, p.avatar_color as "avatarColor", p.current_language as "currentLanguage",
  p.timezone, p.tts_rate::float as "ttsRate", p.autoplay_audio as "autoplayAudio",
  p.show_in_rankings as "showInRankings", p.weekly_goal_xp as "weeklyGoalXp",
  (p.voice_consent_at is not null) as "voiceConsent", p.is_demo as "isDemo"`;

export async function getUserById(id: string): Promise<CurrentUser | null> {
  return queryOne<CurrentUser>(`select ${USER_COLUMNS} from users u join profiles p on p.user_id = u.id where u.id = $1`, [id]);
}

export async function resolveAuthSession(token: string | undefined | null): Promise<CurrentUser | null> {
  if (!token || token.length > 200) return null;
  const row = await queryOne<CurrentUser & { sessionId: string; lastSeen: Date }>(
    `select ${USER_COLUMNS}, s.id as "sessionId", s.last_seen_at as "lastSeen"
       from auth_sessions s
       join users u on u.id = s.user_id
       join profiles p on p.user_id = u.id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  if (!row) return null;
  if (Date.now() - new Date(row.lastSeen).getTime() > 3600_000) {
    await query(`update auth_sessions set last_seen_at = now(), expires_at = greatest(expires_at, now() + interval '${SESSION_DAYS} days') where id = $1`, [
      row.sessionId,
    ]);
  }
  const user: Partial<typeof row> = { ...row };
  delete user.sessionId;
  delete user.lastSeen;
  return user as CurrentUser;
}

export async function revokeAuthSession(token: string): Promise<void> {
  await query(`delete from auth_sessions where token_hash = $1`, [hashToken(token)]);
}

export async function revokeAllSessions(userId: string, client?: Queryable): Promise<void> {
  await query(`delete from auth_sessions where user_id = $1`, [userId], client);
}
