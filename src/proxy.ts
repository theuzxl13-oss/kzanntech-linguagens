import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "kl_session";
const PROTECTED = ["/painel", "/aprender", "/idiomas", "/jogar", "/sessao", "/resultado", "/rankings", "/conquistas", "/historico", "/vocabulario", "/perfil", "/planos", "/estatisticas", "/assinatura", "/admin"];
const AUTH_PAGES = ["/entrar", "/cadastro"];

/**
 * Verificação otimista baseada apenas na presença do cookie (sem acesso ao banco).
 * A autorização real acontece no servidor: layouts (requireUser/requireAdmin) e rotas de API.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);
  if (!hasSession && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = new URL("/entrar", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (hasSession && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/painel", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|audio/).*)"],
};
