import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const isDev = process.env.NODE_ENV !== "production";

// Cabeçalhos de segurança aplicados a todas as rotas.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS só em produção (em http://localhost o navegador ignoraria e poderia atrapalhar o dev)
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microfone apenas na própria origem (Jogo com Vozes); câmera e localização bloqueadas.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob: data: https:",
      "font-src 'self' data:",
      `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Cache Components desativado de propósito: quase todas as páginas são autenticadas e
  // dependem do usuário da requisição (ver docs/ARCHITECTURE.md).
  poweredByHeader: false,
  // O driver pg usa o pg-cloudflare (sockets TCP do Workers); o rastreamento padrão só copia a versão vazia para Node.
  outputFileTracingIncludes: { "/*": ["./node_modules/pg-cloudflare/**/*"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

// Disponibiliza os bindings do Cloudflare (ex.: HYPERDRIVE) no `next dev`, se configurados.
initOpenNextCloudflareForDev();
