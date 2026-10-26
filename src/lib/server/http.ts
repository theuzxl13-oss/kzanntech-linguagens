import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { config } from "./config";
import { HttpError, badRequest, forbidden } from "./errors";
import { logEvent } from "./events";

export function json<T>(data: T, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

/** Proteção CSRF: requisições que alteram estado precisam vir da mesma origem. */
export function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin) {
    // Navegadores modernos sempre enviam Origin em POST/PATCH/DELETE com fetch.
    if (req.headers.get("sec-fetch-site") === "same-origin") return;
    throw forbidden("Origem da requisição ausente.");
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Origem inválida.");
  }
  const allowed = new Set([host, new URL(config.appUrl).host].filter(Boolean));
  if (!allowed.has(originHost)) throw forbidden("Origem da requisição não permitida.");
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("invalid_json", "Corpo da requisição inválido.");
  }
  return schema.parse(body);
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Envolve um route handler: CSRF, validação e tratamento seguro de erros. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
      }
      if (err instanceof ZodError) {
        return json(
          {
            error: {
              code: "validation_error",
              message: err.issues[0]?.message ?? "Dados inválidos.",
              details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            },
          },
          400,
        );
      }
      // Erros de autenticação/redirect do Next precisam ser propagados
      if (err && typeof err === "object" && "digest" in err) throw err;
      await logEvent("error", `api ${req.method} ${new URL(req.url).pathname}`, (err as Error)?.message ?? String(err), {
        stack: (err as Error)?.stack?.split("\n").slice(0, 6).join("\n"),
      });
      return json({ error: { code: "internal_error", message: "Ocorreu um erro inesperado. Tente novamente." } }, 500);
    }
  };
}
