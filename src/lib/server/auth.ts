import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { config } from "./config";
import { forbidden, unauthorized } from "./errors";
import { SESSION_COOKIE, SESSION_DAYS, resolveAuthSession, type CurrentUser } from "./session-store";

export type { CurrentUser };

/** Usuário da requisição atual (deduplicado por requisição). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveAuthSession(token);
});

/** Para páginas: redireciona para o login quando não autenticado. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  if (user.status === "suspended") redirect("/conta-suspensa");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/painel?erro=sem-permissao");
  return user;
}

/** Para rotas de API: lança 401/403 em vez de redirecionar. */
export async function apiUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  if (user.status === "suspended") throw forbidden("Sua conta está suspensa.");
  return user;
}

export async function apiAdmin(): Promise<CurrentUser> {
  const user = await apiUser();
  if (user.role !== "admin") throw forbidden();
  return user;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
  return { ip, userAgent: h.get("user-agent") };
}
