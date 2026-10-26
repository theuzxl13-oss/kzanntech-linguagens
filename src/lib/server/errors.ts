export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new HttpError(400, code, message, details);
export const unauthorized = (message = "Faça login para continuar.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "Você não tem permissão para esta ação.") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Não encontrado.") => new HttpError(404, "not_found", message);
export const conflict = (code: string, message: string, details?: unknown) => new HttpError(409, code, message, details);
export const gone = (code: string, message: string) => new HttpError(410, code, message);
export const tooMany = (message = "Muitas tentativas. Aguarde um pouco e tente novamente.") => new HttpError(429, "rate_limited", message);
