import type { AnchorHTMLAttributes } from "react";

/** Substituto de next/link para a demonstração estática: rotas viram âncoras com hash (#/rota). */
export function toHash(href: unknown): string {
  const h = typeof href === "string" ? href : String((href as { pathname?: string })?.pathname ?? "/");
  return h.startsWith("/") ? `#${h}` : h;
}

export default function Link({ href, prefetch: _p, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: unknown; prefetch?: unknown }) {
  void _p;
  return <a href={toHash(href)} {...props} />;
}
