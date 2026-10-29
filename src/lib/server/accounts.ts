import { z } from "zod";
import { stopBillingForDeletedAccount } from "./billing/service";
import { config } from "./config";
import { query, queryOne, tx } from "./db";
import { sendEmail } from "./email";
import { badRequest, conflict, forbidden, unauthorized } from "./errors";
import { audit } from "./events";
import { hashPassword, needsRehash, verifyPassword } from "./password";
import { enforceRateLimit } from "./rate-limit";
import { createAuthSession, hashToken, newToken, revokeAllSessions } from "./session-store";

export const AVATARS = ["fox", "cat", "owl", "panda", "rabbit", "bear", "koala", "penguin", "frog", "lion"] as const;
export const AVATAR_COLORS = ["violet", "teal", "amber", "rose", "sky", "lime", "slate"] as const;

const email = z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254);
const password = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(128, "A senha pode ter no máximo 128 caracteres.")
  .refine((p) => /[A-Za-zÀ-ÿ]/.test(p) && /\d/.test(p), "Use letras e números na senha.");
const nickname = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]{3,24}$/, "O apelido deve ter de 3 a 24 caracteres: letras, números, ponto, hífen ou sublinhado.");

export const signupSchema = z.object({
  email,
  password,
  nickname,
  acceptTerms: z.literal(true, { error: "É necessário aceitar os Termos de Uso e a Política de Privacidade." }),
});
export const loginSchema = z.object({ email, password: z.string().min(1, "Informe a senha.").max(128) });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Informe sua senha.").max(128),
  confirm: z.literal("EXCLUIR", { error: "Digite EXCLUIR para confirmar." }),
});
export const LEARNING_GOALS = ["travel", "work", "study", "culture", "other"] as const;

export const profileSchema = z
  .object({
    nickname,
    avatar: z.enum(AVATARS),
    avatarColor: z.enum(AVATAR_COLORS),
    timezone: z.string().max(64).refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Fuso horário inválido."),
    ttsRate: z.number().min(0.5).max(1.5),
    autoplayAudio: z.boolean(),
    showInRankings: z.boolean(),
    weeklyGoalXp: z.number().int().min(50).max(5000),
    dailyGoalXp: z.number().int().min(10).max(500),
    learningGoal: z.enum(LEARNING_GOALS),
  })
  .partial();

/** Onboarding: objetivo e meta diária (pode ser pulado; os padrões continuam valendo). */
export const onboardingSchema = z.object({
  learningGoal: z.enum(LEARNING_GOALS).nullable(),
  dailyGoalXp: z.number().int().min(10).max(500),
});

export async function completeOnboarding(userId: string, input: z.infer<typeof onboardingSchema>) {
  await query(
    `update profiles set learning_goal = $2, daily_goal_xp = $3, weekly_goal_xp = greatest(50, least(5000, $3 * 7)),
            onboarded_at = coalesce(onboarded_at, now()), updated_at = now() where user_id = $1`,
    [userId, input.learningGoal, input.dailyGoalXp],
  );
  return { ok: true };
}

type Meta = { ip?: string | null; userAgent?: string | null };

// Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar contas cadastradas.
let dummyHash: Promise<string> | null = null;

const normEmail = (e: string) => e.trim().toLowerCase();

export async function signup(input: z.infer<typeof signupSchema>, meta: Meta) {
  input = { ...input, email: normEmail(input.email) };
  await enforceRateLimit(`signup:${meta.ip}`, 10, 3600, "Muitos cadastros a partir desta rede. Tente mais tarde.");
  const exists = await queryOne(`select 1 from users where email = $1`, [input.email]);
  if (exists) throw conflict("email_taken", "Este e-mail já está cadastrado. Tente entrar ou recuperar a senha.");
  const nickTaken = await queryOne(`select 1 from profiles where nickname = $1`, [input.nickname]);
  if (nickTaken) throw conflict("nickname_taken", "Este apelido já está em uso. Escolha outro.");

  const passwordHash = await hashPassword(input.password);
  const userId = await tx(async (client) => {
    const u = await client.query<{ id: string }>(`insert into users (email, password_hash) values ($1,$2) returning id`, [
      input.email,
      passwordHash,
    ]);
    const id = u.rows[0].id;
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    await client.query(`insert into profiles (user_id, nickname, avatar) values ($1,$2,$3)`, [id, input.nickname, avatar]);
    await client.query(`insert into user_stats (user_id) values ($1)`, [id]);
    return id;
  }).catch((err) => {
    if (err?.code === "23505") throw conflict("duplicate", "E-mail ou apelido já cadastrado.");
    throw err;
  });
  await sendVerificationEmail(userId, input.email);
  const session = await createAuthSession(userId, meta);
  return { userId, ...session };
}

export async function login(input: z.infer<typeof loginSchema>, meta: Meta) {
  input = { ...input, email: normEmail(input.email) };
  await enforceRateLimit(`login:ip:${meta.ip}`, 30, 900);
  await enforceRateLimit(`login:email:${input.email}`, 8, 900, "Muitas tentativas para esta conta. Aguarde 15 minutos.");
  const user = await queryOne<{ id: string; password_hash: string; status: string }>(
    `select id, password_hash, status from users where email = $1`,
    [input.email],
  );
  if (!user) {
    dummyHash ??= hashPassword("dummy-password-for-timing");
    await verifyPassword(input.password, await dummyHash);
    throw unauthorized("E-mail ou senha incorretos.");
  }
  if (!(await verifyPassword(input.password, user.password_hash))) throw unauthorized("E-mail ou senha incorretos.");
  if (user.status === "suspended") throw forbidden("Esta conta está suspensa. Entre em contato com o suporte.");
  // Atualiza hashes antigos para os parâmetros atuais (a senha em texto só existe neste momento)
  if (needsRehash(user.password_hash)) {
    await query(`update users set password_hash = $2, updated_at = now() where id = $1`, [user.id, await hashPassword(input.password)]);
  }
  return createAuthSession(user.id, meta);
}

async function issueToken(userId: string, purpose: "reset_password" | "verify_email", ttlMinutes: number) {
  const token = newToken();
  await query(`update auth_tokens set used_at = now() where user_id = $1 and purpose = $2 and used_at is null`, [userId, purpose]);
  await query(`insert into auth_tokens (user_id, purpose, token_hash, expires_at) values ($1,$2,$3, now() + make_interval(mins => $4))`, [
    userId,
    purpose,
    hashToken(token),
    ttlMinutes,
  ]);
  return token;
}

async function consumeToken(token: string, purpose: "reset_password" | "verify_email") {
  return queryOne<{ user_id: string }>(
    `update auth_tokens set used_at = now()
      where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
      returning user_id`,
    [hashToken(token), purpose],
  );
}

export async function sendVerificationEmail(userId: string, to: string) {
  const token = await issueToken(userId, "verify_email", 60 * 24 * 3);
  return sendEmail({
    to,
    subject: "Confirme seu e-mail no KeyLingo",
    text: `Olá!\n\nPara confirmar seu e-mail, acesse:\n${config.appUrl}/verificar-email?token=${token}\n\nO link vale por 3 dias. Se você não criou uma conta, ignore esta mensagem.`,
  });
}

export async function resendVerification(userId: string) {
  await enforceRateLimit(`verify:${userId}`, 3, 3600, "Você já pediu vários e-mails. Aguarde um pouco.");
  const u = await queryOne<{ email: string; email_verified_at: Date | null }>(`select email, email_verified_at from users where id = $1`, [userId]);
  if (!u) throw unauthorized();
  if (u.email_verified_at) return { alreadyVerified: true, delivered: false };
  const r = await sendVerificationEmail(userId, u.email);
  return { alreadyVerified: false, delivered: r.delivered };
}

export async function verifyEmail(token: string) {
  const row = await consumeToken(token, "verify_email");
  if (!row) throw badRequest("invalid_token", "Link inválido ou expirado. Peça um novo e-mail de confirmação.");
  await query(`update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1`, [row.user_id]);
  return { ok: true };
}

/** Sempre responde da mesma forma, exista ou não a conta (não revela e-mails cadastrados). */
export async function requestPasswordReset(emailAddr: string, meta: Meta) {
  emailAddr = normEmail(emailAddr);
  await enforceRateLimit(`forgot:ip:${meta.ip}`, 10, 3600);
  await enforceRateLimit(`forgot:email:${emailAddr}`, 3, 3600);
  const user = await queryOne<{ id: string }>(`select id from users where email = $1 and status = 'active'`, [emailAddr]);
  if (!user) return { transport: config.emailTransport };
  const token = await issueToken(user.id, "reset_password", 60);
  await sendEmail({
    to: emailAddr,
    subject: "Redefinição de senha do KeyLingo",
    text: `Recebemos um pedido para redefinir sua senha.\n\nAcesse: ${config.appUrl}/redefinir-senha?token=${token}\n\nO link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail.`,
  });
  return { transport: config.emailTransport };
}

export async function resetPassword(input: z.infer<typeof resetSchema>, meta: Meta) {
  await enforceRateLimit(`reset:${meta.ip}`, 10, 3600);
  const row = await consumeToken(input.token, "reset_password");
  if (!row) throw badRequest("invalid_token", "Link inválido ou expirado. Solicite uma nova redefinição.");
  const passwordHash = await hashPassword(input.password);
  await tx(async (client) => {
    await client.query(`update users set password_hash = $2, updated_at = now() where id = $1`, [row.user_id, passwordHash]);
    // O acesso ao e-mail comprova a posse do endereço
    await client.query(`update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1`, [row.user_id]);
    await revokeAllSessions(row.user_id, client);
    await audit(row.user_id, "auth.password_reset", { type: "user", id: row.user_id }, undefined, meta.ip, client);
  });
  return { ok: true };
}

export async function changePassword(userId: string, input: z.infer<typeof changePasswordSchema>, meta: Meta) {
  await enforceRateLimit(`chpw:${userId}`, 5, 900);
  const u = await queryOne<{ password_hash: string }>(`select password_hash from users where id = $1`, [userId]);
  if (!u || !(await verifyPassword(input.currentPassword, u.password_hash))) throw badRequest("wrong_password", "Senha atual incorreta.");
  const hash = await hashPassword(input.newPassword);
  await tx(async (client) => {
    await client.query(`update users set password_hash = $2, updated_at = now() where id = $1`, [userId, hash]);
    await revokeAllSessions(userId, client);
    await audit(userId, "auth.password_changed", { type: "user", id: userId }, undefined, meta.ip, client);
  });
  return createAuthSession(userId, meta);
}

export async function updateProfile(userId: string, input: z.infer<typeof profileSchema>) {
  const map: Record<string, string> = {
    nickname: "nickname",
    avatar: "avatar",
    avatarColor: "avatar_color",
    timezone: "timezone",
    ttsRate: "tts_rate",
    autoplayAudio: "autoplay_audio",
    showInRankings: "show_in_rankings",
    weeklyGoalXp: "weekly_goal_xp",
    dailyGoalXp: "daily_goal_xp",
    learningGoal: "learning_goal",
  };
  const sets: string[] = [];
  const values: unknown[] = [userId];
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || !map[k]) continue;
    values.push(v);
    sets.push(`${map[k]} = $${values.length}`);
  }
  if (!sets.length) return;
  try {
    await query(`update profiles set ${sets.join(", ")}, updated_at = now() where user_id = $1`, values);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw conflict("nickname_taken", "Este apelido já está em uso.");
    throw err;
  }
}

export async function setVoiceConsent(userId: string, consent: boolean, meta: Meta) {
  await query(`update profiles set voice_consent_at = ${consent ? "now()" : "null"}, updated_at = now() where user_id = $1`, [userId]);
  await audit(userId, consent ? "privacy.voice_consent_granted" : "privacy.voice_consent_revoked", { type: "user", id: userId }, undefined, meta.ip);
}

/** Exclusão definitiva da conta e de todos os dados pessoais (cascata no banco). */
export async function deleteAccount(userId: string, input: z.infer<typeof deleteAccountSchema>, meta: Meta) {
  const u = await queryOne<{ password_hash: string; role: string }>(`select password_hash, role from users where id = $1`, [userId]);
  if (!u || !(await verifyPassword(input.password, u.password_hash))) throw badRequest("wrong_password", "Senha incorreta.");
  if (u.role === "admin") {
    const admins = await queryOne<{ n: number }>(`select count(*)::int as n from users where role = 'admin'`);
    if ((admins?.n ?? 0) <= 1) throw conflict("last_admin", "Você é o único administrador. Promova outro administrador antes de excluir a conta.");
  }
  // Interrompe cobranças recorrentes no provedor antes de apagar os dados
  await stopBillingForDeletedAccount(userId);
  await tx(async (client) => {
    await audit(null, "account.deleted", { type: "user", id: userId }, undefined, meta.ip, client);
    // Registros de e-mail não têm chave estrangeira para o usuário: removidos explicitamente
    await client.query(`delete from email_outbox where to_email = (select email from users where id = $1)`, [userId]);
    await client.query(`delete from users where id = $1`, [userId]);
  });
}

/** Portabilidade (LGPD art. 18): exporta os dados pessoais do usuário em JSON. */
export async function exportAccountData(userId: string) {
  const [account] = await query(
    `select u.email, u.created_at, u.email_verified_at, p.nickname, p.avatar, p.avatar_color, p.current_language, p.timezone,
            p.tts_rate, p.show_in_rankings, p.weekly_goal_xp, p.daily_goal_xp, p.learning_goal, p.voice_consent_at, p.terms_accepted_at
       from users u join profiles p on p.user_id = u.id where u.id = $1`,
    [userId],
  );
  return {
    exportedAt: new Date().toISOString(),
    account,
    stats: await queryOne(`select * from user_stats where user_id = $1`, [userId]),
    languages: await query(`select * from user_languages where user_id = $1`, [userId]),
    sessions: await query(
      `select id, language_code, mode, format, kind, preset, status, started_at, finished_at, raw_score, xp_awarded, rank_points,
              answered_count, correct_count, accuracy from game_sessions where user_id = $1 order by started_at`,
      [userId],
    ),
    answers: await query(
      `select session_id, idx, attempt_no, answer_text, result, score, response_ms, created_at from answers where user_id = $1 order by created_at`,
      [userId],
    ),
    achievements: await query(`select achievement_code, unlocked_at from user_achievements where user_id = $1`, [userId]),
    xpEvents: await query(`select source, ref, amount, created_at from xp_events where user_id = $1 order by created_at`, [userId]),
    subscriptions: await query(
      `select plan_code, provider, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at from subscriptions where user_id = $1 order by created_at`,
      [userId],
    ),
    missions: await query(
      `select a.mission_id, a.status, a.started_at, a.finished_at, a.score, a.xp_awarded,
              coalesce((select json_agg(json_build_object('step', t.step_idx + 1, 'try', t.try_no, 'answer', t.answer_text, 'passed', t.passed, 'at', t.created_at)
                                order by t.step_idx, t.try_no) from mission_turns t where t.attempt_id = a.id), '[]') as answers
         from mission_attempts a where a.user_id = $1 order by a.started_at`,
      [userId],
    ),
    invoices: await query(`select amount_cents, currency, status, period_start, period_end, created_at from invoices where user_id = $1 order by created_at`, [userId]),
    note: "Gravações de voz não são armazenadas pelo KeyLingo; apenas o texto reconhecido e a nota de cada tentativa. Dados de cartão ficam somente com o provedor de pagamento.",
  };
}
