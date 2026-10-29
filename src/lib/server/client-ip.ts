/**
 * Resolução do IP do cliente para rate limit e auditoria.
 *
 * Cabeçalhos como X-Forwarded-For são definidos por quem faz a requisição; só podem ser usados
 * quando um proxy confiável os sobrescreve. A política vem de TRUST_PROXY:
 *  - "cloudflare": usa CF-Connecting-IP (definido pelo Cloudflare e não repassado do cliente).
 *  - "xff":        usa o valor MAIS À DIREITA de X-Forwarded-For (o adicionado pelo proxy imediato).
 *                  Use apenas atrás de um único proxy reverso que acrescenta esse cabeçalho.
 *  - "none":       ignora cabeçalhos de proxy (desenvolvimento ou acesso direto).
 */
export type TrustProxy = "cloudflare" | "xff" | "none";

export function parseTrustProxy(v: string | undefined): TrustProxy {
  return v === "cloudflare" || v === "xff" ? v : "none";
}

const IP_RE = /^[0-9a-fA-F:.]{2,45}$/;

export function resolveClientIp(get: (name: string) => string | null, trust: TrustProxy): string {
  let ip: string | null = null;
  if (trust === "cloudflare") ip = get("cf-connecting-ip");
  else if (trust === "xff") {
    const parts = (get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    ip = parts[parts.length - 1] ?? null;
  }
  return ip && IP_RE.test(ip) ? ip : "unknown";
}
