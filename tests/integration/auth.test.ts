import { describe, expect, it } from "vitest";
import {
  deleteAccount,
  login,
  requestPasswordReset,
  resetPassword,
  signup,
  updateProfile,
  verifyEmail,
} from "../../src/lib/server/accounts";
import { query, queryOne } from "../../src/lib/server/db";
import { HttpError } from "../../src/lib/server/errors";
import { resolveAuthSession } from "../../src/lib/server/session-store";
import { makeUser } from "./helpers";

async function lastEmailToken(to: string, path: string) {
  const row = await queryOne<{ body_text: string }>(`select body_text from email_outbox where to_email = $1 order by id desc limit 1`, [to]);
  const m = row?.body_text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`));
  return m?.[1];
}

describe("cadastro e login", () => {
  it("cria conta com perfil, estatísticas, sessão e e-mail de verificação", async () => {
    const r = await signup({ email: "Ana@Example.com", password: "senha12345", nickname: "ana_l", acceptTerms: true }, { ip: "a1" });
    const user = await resolveAuthSession(r.token);
    expect(user?.email).toBe("ana@example.com");
    expect(user?.nickname).toBe("ana_l");
    expect(user?.emailVerified).toBe(false);
    expect(await queryOne(`select 1 from user_stats where user_id = $1`, [r.userId])).toBeTruthy();
    const token = await lastEmailToken("ana@example.com", "/verificar-email");
    expect(token).toBeTruthy();
    await verifyEmail(token!);
    expect((await resolveAuthSession(r.token))?.emailVerified).toBe(true);
    await expect(verifyEmail(token!)).rejects.toThrow(/inválido ou expirado/);
  });

  it("não guarda token de sessão nem senha em texto puro", async () => {
    const u = await makeUser();
    const row = await queryOne<{ password_hash: string }>(`select password_hash from users where id = $1`, [u.id]);
    expect(row!.password_hash.startsWith("scrypt$")).toBe(true);
    const s = await queryOne(`select 1 from auth_sessions where token_hash = $1`, [u.token]);
    expect(s).toBeNull();
  });

  it("rejeita e-mail e apelido duplicados", async () => {
    const u = await makeUser();
    await expect(signup({ email: u.email, password: "senha12345", nickname: "outro_nick", acceptTerms: true }, { ip: "x" })).rejects.toMatchObject({
      status: 409,
      code: "email_taken",
    });
    await expect(
      signup({ email: "novo@example.com", password: "senha12345", nickname: u.nickname, acceptTerms: true }, { ip: "x" }),
    ).rejects.toMatchObject({ code: "nickname_taken" });
  });

  it("login com senha errada falha com mensagem genérica", async () => {
    const u = await makeUser();
    await expect(login({ email: u.email, password: "errada123" }, { ip: "l1" })).rejects.toMatchObject({ status: 401 });
    await expect(login({ email: "naoexiste@example.com", password: "errada123" }, { ip: "l1" })).rejects.toMatchObject({ status: 401 });
    const ok = await login({ email: u.email, password: "senha12345" }, { ip: "l1" });
    expect((await resolveAuthSession(ok.token))?.id).toBe(u.id);
  });

  it("limita tentativas de login por conta", async () => {
    const u = await makeUser();
    let blocked: HttpError | null = null;
    for (let i = 0; i < 10; i++) {
      try {
        await login({ email: u.email, password: "errada123" }, { ip: `r${i}` });
      } catch (e) {
        if ((e as HttpError).status === 429) blocked = e as HttpError;
      }
    }
    expect(blocked?.status).toBe(429);
  });

  it("recupera senha com token de uso único e revoga sessões antigas", async () => {
    const u = await makeUser();
    await requestPasswordReset(u.email, { ip: "f1" });
    const token = await lastEmailToken(u.email, "/redefinir-senha");
    expect(token).toBeTruthy();
    await resetPassword({ token: token!, password: "novaSenha99" }, { ip: "f1" });
    expect(await resolveAuthSession(u.token)).toBeNull();
    await expect(resetPassword({ token: token!, password: "outraSenha99" }, { ip: "f1" })).rejects.toMatchObject({ code: "invalid_token" });
    const ok = await login({ email: u.email, password: "novaSenha99" }, { ip: "f1" });
    expect(ok.token).toBeTruthy();
  });

  it("pedido de recuperação não revela se o e-mail existe", async () => {
    const r = await requestPasswordReset("ninguem@example.com", { ip: "f2" });
    expect(r).toHaveProperty("transport");
  });

  it("usuário suspenso não consegue entrar", async () => {
    const u = await makeUser();
    await query(`update users set status = 'suspended' where id = $1`, [u.id]);
    await expect(login({ email: u.email, password: "senha12345" }, { ip: "s1" })).rejects.toMatchObject({ status: 403 });
  });

  it("atualiza perfil e impede apelido repetido", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await updateProfile(a.id, { avatar: "owl", weeklyGoalXp: 500 });
    await expect(updateProfile(a.id, { nickname: b.nickname })).rejects.toMatchObject({ code: "nickname_taken" });
  });

  it("exclui a conta e todos os dados associados", async () => {
    const u = await makeUser();
    await expect(deleteAccount(u.id, { password: "errada", confirm: "EXCLUIR" }, { ip: "d" })).rejects.toMatchObject({ code: "wrong_password" });
    await deleteAccount(u.id, { password: "senha12345", confirm: "EXCLUIR" }, { ip: "d" });
    expect(await queryOne(`select 1 from users where id = $1`, [u.id])).toBeNull();
    expect(await queryOne(`select 1 from profiles where user_id = $1`, [u.id])).toBeNull();
    expect(await resolveAuthSession(u.token)).toBeNull();
  });
});
