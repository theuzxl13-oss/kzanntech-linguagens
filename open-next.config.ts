import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Todas as páginas do KeyLingo são dinâmicas (dependem do usuário), então não há cache
// incremental (ISR) a configurar: a configuração padrão basta.
export default defineCloudflareConfig({});
