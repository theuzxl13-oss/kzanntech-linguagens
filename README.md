# KeyLingo

Plataforma web gamificada para aprender idiomas **digitando** e **falando**. Inglês, espanhol, francês, alemão e italiano, com XP, níveis, conquistas, desafios diários, revisão espaçada, rankings por modalidade, ranking geral, ligas e temporadas.

> **Estado atual:** aplicação funcional, testada de ponta a ponta localmente (PostgreSQL real + build de produção). **Ainda não está pronta para produção pública** — veja [Limitações conhecidas](#limitações-conhecidas).

## Demonstração navegável (GitHub Pages)

Uma versão de **demonstração** roda inteira no navegador, sem servidor nem banco: **https://theuzxl13-oss.github.io/kzanntech-linguagens/** (disponível depois de ativar o Pages, veja abaixo).

- Usa as mesmas telas (inclusive a trilha de lições), regras de correção, pontuação, XP e conteúdo do app real.
- O progresso fica salvo só no navegador (`localStorage`); os rankings usam jogadores fictícios marcados como DEMO.
- Não tem: contas reais, e-mail, painel administrativo, avaliação de pronúncia no servidor nem proteções anti-fraude (tudo roda no navegador).
- Voz: usa o reconhecimento de fala do navegador (Chrome, Edge ou Safari); o áudio de referência usa as vozes instaladas no dispositivo.

Para publicar: **Settings → Pages → Build and deployment → Source: GitHub Actions** (uma vez). O workflow `.github/workflows/demo-pages.yml` gera e publica a demo a cada push. Para gerar localmente: `npm run demo:build` (saída em `demo/dist`).

## Funcionalidades

| Área | O que existe |
|---|---|
| Conta | Cadastro, login, logout, recuperação de senha, verificação de e-mail, troca de senha, perfil (apelido/avatar), exclusão de conta e exportação de dados (LGPD) |
| Trilha de aprendizado (escola) | Lições em sequência para quem começa do zero: apresentação de cada palavra/frase (tradução, áudio, explicação), prática guiada em dificuldade crescente (reconhecer → escolher → escrever com dica), erros voltando até o domínio, dicas iniciais de cada idioma, desbloqueio progressivo (quem declara nível mais alto pode pular), XP e revisão espaçada dos itens aprendidos |
| Idiomas | 5 idiomas, níveis CEFR (A1–C2), 10 categorias, unidades por tema, teste de nivelamento opcional; novos idiomas pelo admin sem alterar código |
| Jogo de Digitar | Tradução (idioma → PT), escrita (PT → idioma), escuta e digitação; sessão rápida, desafios de 60 s / 3 min / 5 min, prática livre; pausa (sem cronômetro), novas tentativas, "Não sei", explicação do erro com diff, teclas de acentos, retomada após recarregar |
| Jogo com Vozes | Ouvir referência, gravar, transcrição, nota, palavras destacadas, dicas, até 3 tentativas; consentimento do microfone; avaliação de pronúncia real no servidor (Azure) **ou** avaliação aproximada do navegador, claramente rotulada |
| Progresso | XP e níveis, sequência de dias, tempo de estudo, itens aprendidos, taxa de acerto, gráfico de evolução, histórico e recordes, conquistas, desafios diários, meta semanal, recomendações, revisão espaçada (SM-2) e vocabulário com áudio |
| Rankings | Digitação, Vozes e Geral; filtros por idioma e período (semana, temporada, todos os tempos, temporadas encerradas); evolução de posição; ligas Bronze → Mestre; temporadas mensais com histórico congelado |
| Admin | Métricas, CRUD de conteúdo com respostas alternativas, revisão (rascunho/pendente/aprovado/arquivado), áudios, idiomas, categorias, temporadas, regras de pontuação versionadas, moderação de usuários e registros (erros, auditoria, e-mails) |

## Stack

- **Next.js 16** (App Router, React 19, TypeScript) + **Tailwind CSS 4**
- **PostgreSQL** via `pg`, migrações SQL versionadas (`db/migrations`) — funciona em PostgreSQL local, Supabase, Neon, RDS etc.
- Implantação no **Cloudflare Workers** (adaptador OpenNext + Hyperdrive) ou em qualquer servidor Node.js
- Autenticação própria no servidor (scrypt + sessões em cookie `httpOnly`), validação com **Zod**
- Voz: **Azure AI Speech** (TTS + STT + avaliação de pronúncia) no servidor, com fallback para a Web Speech API do navegador
- Testes: **Vitest** (unitários e integração com Postgres real) e **Playwright** (E2E desktop e celular)

Por que não Supabase Auth? Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#decisões).

## Executar localmente

Pré-requisitos: Node.js ≥ 20.9 e PostgreSQL ≥ 14.

```bash
npm install
cp .env.example .env.local          # ajuste DATABASE_URL e gere AUTH_SECRET (openssl rand -hex 32)
createdb keylingo_dev
npm run db:setup                     # aplica migrações e importa o conteúdo inicial
ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD='SenhaForte123' npm run db:seed   # cria o 1º admin (opcional)
npm run dev                          # http://localhost:3000
```

Dados de **demonstração** (usuários fictícios marcados com selo "DEMO" nos rankings): `npm run db:seed:demo`. Não use em produção.

Em desenvolvimento, `EMAIL_TRANSPORT=log` imprime os e-mails (links de verificação e de redefinição de senha) no console do servidor.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` / `build` / `start` | Desenvolvimento, build e servidor de produção |
| `npm run typecheck` / `lint` | TypeScript e ESLint |
| `npm run db:migrate` | Aplica migrações pendentes (recusa migrações já aplicadas que foram editadas) |
| `npm run db:seed` | Catálogo (idempotente; não sobrescreve edições do admin) e admin opcional |
| `npm run test:unit` | Testes unitários (domínio, pontuação, correção, voz, adaptador Azure) |
| `npm run test:integration` | Integração com PostgreSQL real (`TEST_DATABASE_URL`, padrão `keylingo_test`; o schema é recriado) |
| `npm run test:e2e` | E2E com Playwright contra o build de produção (`E2E_DATABASE_URL`, padrão `keylingo_e2e`). Rode `npm run build` antes. Com `E2E_BASE_URL`, roda contra um servidor já iniciado (ex.: preview do Cloudflare) |
| `npm run cf:preview` | Build para o Cloudflare e preview local no runtime real dos Workers (`workerd`) |
| `npm run cf:deploy` | Build e publicação no Cloudflare Workers |

## Estrutura

```
db/migrations/         SQL versionado (esquema, índices, restrições, RLS)
db/seed/content.ts     Conteúdo inicial (pendente de revisão) e conquistas
scripts/               migrate, seed, db-reset
src/proxy.ts           Redirecionamento otimista de rotas privadas
src/app/(public)       Landing, privacidade, termos
src/app/(auth)         Entrar, cadastro, recuperar/redefinir senha, verificar e-mail
src/app/(app)          Painel, idiomas, jogar, sessão, resultado, rankings, conquistas, histórico, vocabulário, perfil
src/app/admin          Painel administrativo
src/app/api            Rotas de API (toda regra de negócio passa pelo servidor)
src/components         UI, jogadores de sessão (digitação e voz), formulários
src/lib/domain         Lógica pura: correção, pontuação, SRS, voz, desafios, conquistas
src/lib/server         Banco, autenticação, sessões de jogo, rankings, temporadas, admin, provedores de voz
tests/unit|integration|e2e
docs/                  Arquitetura, pontuação, implantação
```

## Documentação

- [Arquitetura, modelo de dados e segurança](docs/ARCHITECTURE.md)
- [Fórmulas de pontuação, XP, rankings e ligas](docs/SCORING.md)
- [Cloudflare (passo a passo), Supabase, serviços de áudio, e-mail e testes](docs/DEPLOY.md)

## Testes

Última execução: **44 unitários, 28 de integração (PostgreSQL 16) e 14 E2E (Chromium desktop + Pixel 7) — todos passando.** Os 14 E2E passam tanto no build Node.js (`next start`) quanto no runtime do Cloudflare Workers (`wrangler dev`, com Hyperdrive apontando para PostgreSQL local).

Cobrem: cadastro/login/recuperação/verificação, escolha de idioma, os três formatos de digitação, voz (provedor simulado no servidor e reconhecimento do navegador simulado), microfone negado, cálculo de pontuação, XP decrescente, níveis, rankings individuais e geral, temporadas, segurança de rotas, CSRF, rate limit, envio duplicado, manipulação de pontuação, sessão interrompida, resposta vazia, áudio indisponível e responsividade.

## Limitações conhecidas

- **A avaliação de pronúncia real não foi testada contra a API da Azure.** O adaptador segue a API REST documentada e tem testes de contrato com `fetch` simulado, mas não havia chave disponível. Teste com uma chave real antes de anunciar o recurso.
- Sem chave Azure, a voz usa a Web Speech API do navegador (Chrome, Edge, Safari; o Firefox não oferece). A nota é **aproximada** (palavras reconhecidas), as sessões de voz não entram no ranking por padrão e o áudio de referência depende das vozes do dispositivo. A escuta competitiva no Jogo de Digitar exige áudio do servidor.
- Algumas lições da trilha são curtas (1–2 itens) porque o conteúdo inicial tem poucos itens em certos temas/níveis; ampliar o conteúdo pelo painel admin resolve.
- **O conteúdo inicial não é verificado:** 71 conceitos × 5 idiomas (355 itens) foram redigidos com apoio de IA e estão marcados como *pendentes de revisão*. Precisam ser revisados por professores/nativos no painel admin. Não há gravações humanas; o áudio é sintético. Faltam frases de exemplo na maioria dos itens.
- Política de Privacidade e Termos são modelos que exigem revisão jurídica e os dados do controlador.
- Login social não foi implementado. O e-mail exige Resend (Cloudflare) ou SMTP (Node.js) configurado em produção.
- **Cloudflare:** o hash de senha (scrypt) usa ~50 ms de CPU e o plano gratuito dos Workers permite 10 ms por requisição; use o plano **Workers Paid**. O deploy real no Cloudflare não foi executado (precisa da sua conta); foi validado no runtime local `workerd`.
- O rate limit usa o banco (janela fixa) e o IP de `X-Forwarded-For`: configure o proxy/CDN para sobrescrever esse cabeçalho.
- A CSP usa `'unsafe-inline'` para scripts (padrão do Next sem nonce).
- Não há limpeza agendada de `rate_limits`, `app_events` e tokens expirados além da limpeza oportunista; agende uma tarefa (ver DEPLOY.md).
- Detecção avançada de fraude (bots, contas múltiplas) não existe além das proteções descritas em ARCHITECTURE.md.
- Sem tema escuro.
