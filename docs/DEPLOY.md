# Configuração e implantação

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

`EMAIL_TRANSPORT=smtp`, `SMTP_URL=smtps://usuario:senha@host:465`, `EMAIL_FROM="KeyLingo <no-reply@seudominio>"`. Sem SMTP em produção, o transporte padrão é `disabled` e a interface informa que o envio está indisponível.

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
