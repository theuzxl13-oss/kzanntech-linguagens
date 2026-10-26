# Configuração e implantação

## Cloudflare Workers (passo a passo)

O KeyLingo roda no Cloudflare Workers pelo adaptador oficial [OpenNext](https://opennext.js.org/cloudflare). O banco fica no Supabase (PostgreSQL) e o Cloudflare se conecta a ele pelo **Hyperdrive**, que mantém um pool de conexões perto do Worker. (O "Cloudflare Pages" clássico não é usado: para Next.js com servidor, o Cloudflare usa Workers.)

> **Plano necessário:** use o **Workers Paid (US$ 5/mês)**. O plano gratuito limita cada requisição a 10 ms de CPU; só o hash seguro de senha (scrypt) leva ~50 ms, e páginas renderizadas no servidor também passam disso. O tamanho do app (~2 MiB compactado) cabe em ambos os planos.

O que já foi verificado: o build do OpenNext e os 14 testes E2E rodando no runtime `workerd` local (`wrangler dev`) com Hyperdrive apontando para um PostgreSQL local. O deploy na sua conta e o Hyperdrive real ainda não foram executados.

### 1. Banco no Supabase

1. Crie um projeto no supabase.com, de preferência na região **South America (São Paulo)**.
2. Copie a *connection string* direta (porta 5432) em **Project Settings → Database**.
3. No seu computador, crie as tabelas e o primeiro administrador:
   ```bash
   DATABASE_URL="postgresql://..." DATABASE_SSL=true npm run db:migrate
   DATABASE_URL="postgresql://..." DATABASE_SSL=true ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD='SenhaForte123' npm run db:seed
   ```

### 2. Conta e Hyperdrive no Cloudflare

```bash
npx wrangler login
npx wrangler hyperdrive create keylingo-db --connection-string="postgresql://...(a mesma do Supabase)"
```
Cole o `id` retornado em `wrangler.jsonc` (campo `hyperdrive[0].id`).

### 3. E-mail (Resend)

O Cloudflare não permite SMTP pelo `nodemailer`; use a API do Resend (plano gratuito). Crie a chave em resend.com e, para enviar a qualquer destinatário, verifique um domínio seu e ajuste `EMAIL_FROM` em `wrangler.jsonc`.

### 4. Variáveis e segredos

Em `wrangler.jsonc` (seção `vars`), ajuste `APP_URL` para o endereço final (ex.: `https://keylingo.SEU-SUBDOMINIO.workers.dev` ou seu domínio). Depois, cadastre os segredos:

```bash
npx wrangler secret put AUTH_SECRET        # gere com: openssl rand -hex 32
npx wrangler secret put RESEND_API_KEY
# opcional, para avaliação de pronúncia real:
npx wrangler secret put AZURE_SPEECH_KEY   # e defina SPEECH_PROVIDER=azure e AZURE_SPEECH_REGION em vars
```

### 5. Publicar

```bash
npm run cf:deploy
```
O comando mostra a URL publicada. Confira `GET /api/health` (deve responder `{"ok":true,"db":"ok"}`) e faça um cadastro de teste.

Atualizações: rode `npm run db:migrate` (com a `DATABASE_URL` do Supabase) antes de `npm run cf:deploy` quando houver novas migrações. Também é possível conectar o repositório no painel do Cloudflare (Workers Builds) com o comando de build `npx opennextjs-cloudflare build` e o de deploy `npx opennextjs-cloudflare deploy`.

### Preview local no runtime do Cloudflare

```bash
cp .dev.vars.example .dev.vars   # ajuste AUTH_SECRET
npm run cf:preview               # http://localhost:8787, usa o banco de "localConnectionString" no wrangler.jsonc
```

### Diferenças técnicas no Cloudflare

- Conexões com o banco não podem ser compartilhadas entre requisições: o código (`src/lib/server/db.ts`) reaproveita uma conexão por requisição e abre uma separada para cada transação; o Hyperdrive faz o pooling.
- E-mail via API HTTP (Resend) em vez de SMTP.
- `pg-cloudflare` é incluído explicitamente no build (`outputFileTracingIncludes` em `next.config.ts`).

---

## Outras hospedagens (Node.js)

## 1. Banco de dados no Supabase

1. Crie um projeto em supabase.com.
2. Em **Project Settings → Database → Connection string**, copie a URI. Para servidores persistentes, use a conexão direta (porta 5432); em ambiente serverless, use o *Session pooler*.
3. Configure `DATABASE_URL=<uri>` e `DATABASE_SSL=true`.
4. Rode `npm run db:migrate` e `npm run db:seed` (com `ADMIN_EMAIL`/`ADMIN_PASSWORD` para criar o primeiro administrador).

A migração habilita RLS em todas as tabelas e revoga o acesso dos papéis `anon` e `authenticated`: as chaves públicas do Supabase não conseguem ler nem gravar nada. **Não** exponha a `service_role` nem a string de conexão no frontend — o KeyLingo não usa nenhuma variável `NEXT_PUBLIC_*`.

Qualquer outro PostgreSQL ≥ 14 também funciona (Neon, RDS, Railway, local).

## 2. Serviços de áudio

### Azure AI Speech (TTS + reconhecimento + avaliação de pronúncia)

1. No portal Azure, crie um recurso **Speech** (há um nível gratuito com cota mensal; confira a página de preços atual).
2. Configure `SPEECH_PROVIDER=azure`, `AZURE_SPEECH_KEY=…` e `AZURE_SPEECH_REGION=…`.
3. Verifique: no Jogo com Vozes, o aviso deve dizer "Avaliação de pronúncia no servidor". Faça uma sessão e confira em Admin → Registros que não há erros `speech.*`.

Os locales usados (en-US, es-ES, fr-FR, de-DE, it-IT) estão entre os suportados pela avaliação de pronúncia da Azure; confirme na documentação atual antes de adicionar novos idiomas. A chave fica só no servidor; o áudio é enviado à Microsoft apenas para avaliação, não é armazenado pelo KeyLingo, e o usuário é informado disso no consentimento.

> ⚠️ Esta integração foi implementada conforme a API REST documentada e validada com testes de contrato, **mas não foi executada contra a API real** durante o desenvolvimento (não havia chave disponível).

### Sem provedor (`SPEECH_PROVIDER=none`)

- Áudio de referência: vozes do navegador (`speechSynthesis`).
- Reconhecimento: Web Speech API (Chrome/Edge/Safari). Avaliação aproximada, apenas treino.
- Escuta competitiva no Jogo de Digitar fica desativada (o treino funciona).

### Áudios gravados

Em Admin → Conteúdo → item → *Áudios de referência*, associe arquivos em `public/audio/...` ou URLs https. Eles têm prioridade sobre a síntese. Registre licença e origem.

### Trocar de fornecedor

Implemente `SpeechProvider` (`src/lib/server/speech/types.ts`) e registre o adaptador em `speech/index.ts`.

## 3. E-mail

`EMAIL_TRANSPORT=resend` + `RESEND_API_KEY` (funciona em qualquer hospedagem), ou `EMAIL_TRANSPORT=smtp`, `SMTP_URL=smtps://usuario:senha@host:465`, `EMAIL_FROM="KeyLingo <no-reply@seudominio>"`. Sem SMTP em produção, o transporte padrão é `disabled` e a interface informa que o envio está indisponível.

## 4. Implantação

Qualquer hospedagem Node.js ≥ 20.9 (Vercel, Render, Fly.io, Railway ou VPS com `npm run build && npm start`).

Checklist:

- [ ] `APP_URL` com o domínio https definitivo (usado nos links de e-mail e na verificação de origem)
- [ ] `AUTH_SECRET` aleatório (≥ 32 caracteres), diferente por ambiente
- [ ] `DATABASE_URL` + `DATABASE_SSL=true`; migrações executadas no deploy (`npm run db:migrate`)
- [ ] SMTP configurado e testado (cadastro e recuperação de senha)
- [ ] Provedor de voz configurado e testado, ou aceite consciente do modo aproximado
- [ ] Proxy/CDN sobrescrevendo `X-Forwarded-For` (o rate limit usa esse IP)
- [ ] Tarefa diária de limpeza:
  ```sql
  delete from rate_limits where window_start < now() - interval '1 day';
  delete from app_events where created_at < now() - interval '90 days';
  delete from auth_tokens where expires_at < now() - interval '7 days';
  delete from auth_sessions where expires_at < now();
  ```
- [ ] Revisão jurídica da Política de Privacidade e dos Termos; dados do controlador/DPO
- [ ] Conteúdo revisado e aprovado por especialistas
- [ ] Backups do banco habilitados
- [ ] Nunca rodar `db:seed:demo` em produção

Health check: `GET /api/health`.

## 5. Testes

```bash
createdb keylingo_test && createdb keylingo_e2e
npm run test:unit
npm run test:integration            # recria o schema de keylingo_test
npm run build && npm run test:e2e   # sobe `next start` na porta 3100 com keylingo_e2e
```

As URLs podem ser alteradas com `TEST_DATABASE_URL` e `E2E_DATABASE_URL`. Os bancos de teste são apagados a cada execução — nunca aponte para dados reais.
