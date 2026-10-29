/**
 * Valida destinos de redirecionamento vindos da URL (ex.: ?next=) — evita redirecionamento aberto.
 * Aceita apenas caminhos internos que, resolvidos como URL, continuam na mesma origem.
 */
export function safeInternalPath(next: string | null | undefined, origin = "https://keylingo.invalid"): string | null {
  if (!next || next.length > 2048) return null;
  // Barras invertidas e caracteres de controle são normalizados pelos navegadores (ex.: "/\evil" → "//evil")
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return null;
  try {
    const url = new URL(next, origin);
    if (url.origin !== new URL(origin).origin) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
