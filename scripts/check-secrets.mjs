#!/usr/bin/env node
/**
 * Varredura simples de segredos nos arquivos versionados (complementa o secret scanning do GitHub).
 * Procura padrões de chaves conhecidas e atribuições de variáveis sensíveis com valor real.
 * Nunca imprime o valor encontrado: só arquivo, linha e tipo.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  ["chave privada", /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["token do GitHub", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["chave Stripe", /\b(sk|rk)_live_[A-Za-z0-9]{16,}\b/],
  ["chave Resend", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/],
  ["token Slack", /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/],
  ["chave Google", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["URL com senha", /\b(postgres(ql)?|mysql|smtps?|redis):\/\/[^:\s/]+:[^@\s]{6,}@(?!localhost|127\.0\.0\.1|db\b|postgres\b)[^\s"'`]+/],
  [
    "variável sensível com valor",
    /^\s*(AUTH_SECRET|AZURE_SPEECH_KEY|RESEND_API_KEY|BILLING_WEBHOOK_SECRET|SMTP_URL|ADMIN_PASSWORD)\s*=\s*["']?(?!troque|$|<|\$\{)[^\s"'#]{12,}/,
  ],
];

// Arquivos de teste usam segredos fictícios explícitos
const IGNORE = [/^tests\//, /^package-lock\.json$/, /^demo\/dist\//, /\.(png|jpg|jpeg|gif|ico|webp|woff2?|mp3|wav|zip)$/i, /^scripts\/check-secrets\.mjs$/];

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
let found = 0;
for (const file of files) {
  if (IGNORE.some((r) => r.test(file))) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, i) => {
    for (const [kind, re] of PATTERNS) {
      if (re.test(line)) {
        found++;
        console.error(`${file}:${i + 1}: possível segredo (${kind})`);
      }
    }
  });
}
if (found) {
  console.error(`\n${found} ocorrência(s). Remova o segredo, revogue/rotacione a credencial e use variáveis de ambiente.`);
  process.exit(1);
}
console.log(`Nenhum segredo encontrado em ${files.length} arquivos versionados.`);
