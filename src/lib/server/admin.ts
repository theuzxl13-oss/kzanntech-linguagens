import { z } from "zod";
import { scoringRulesSchema } from "../domain/scoring";
import { query, queryOne, tx } from "./db";
import { badRequest, conflict, notFound } from "./errors";
import { audit } from "./events";
import { closeActiveSeasonNow } from "./seasons";
import { saveScoringRules } from "./settings";

type Meta = { ip?: string | null };

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export async function getAdminMetrics() {
  type Counters = Record<
    "users" | "new_users_7d" | "active_7d" | "sessions_24h" | "sessions_7d" | "voice_sessions_7d" | "avg_accuracy_7d" | "errors_24h" | "suspended",
    number
  >;
  const m = (await queryOne<Counters>(
    `select
       (select count(*)::int from users) as users,
       (select count(*)::int from users where created_at > now() - interval '7 days') as new_users_7d,
       (select count(distinct user_id)::int from game_sessions where started_at > now() - interval '7 days') as active_7d,
       (select count(*)::int from game_sessions where status = 'finished' and finished_at > now() - interval '24 hours') as sessions_24h,
       (select count(*)::int from game_sessions where status = 'finished' and finished_at > now() - interval '7 days') as sessions_7d,
       (select count(*)::int from game_sessions where status = 'finished' and mode = 'voice' and finished_at > now() - interval '7 days') as voice_sessions_7d,
       (select coalesce(avg(accuracy) filter (where answered_count > 0), 0)::float from game_sessions where status = 'finished' and finished_at > now() - interval '7 days') as avg_accuracy_7d,
       (select count(*)::int from app_events where level = 'error' and created_at > now() - interval '24 hours') as errors_24h,
       (select count(*)::int from users where status = 'suspended') as suspended`,
  ))!;
  const content = await query<{ language_code: string; review_status: string; n: number }>(
    `select language_code, review_status, count(*)::int as n from content_items group by 1, 2 order by 1, 2`,
  );
  // Progresso editorial: quanto do conteúdo redigido com IA já passou por revisão humana
  const editorial = await query<{ language_code: string; ai_total: number; ai_approved: number; human_total: number; with_example: number; total: number }>(
    `select language_code,
            count(*) filter (where origin = 'ai_assisted')::int as ai_total,
            count(*) filter (where origin = 'ai_assisted' and review_status = 'approved')::int as ai_approved,
            count(*) filter (where origin <> 'ai_assisted')::int as human_total,
            count(*) filter (where example_text is not null)::int as with_example,
            count(*)::int as total
       from content_items where review_status <> 'archived' group by 1 order by 1`,
  );
  const popularLanguages = await query<{ code: string; flag: string; name_pt: string; sessions: number }>(
    `select l.code, l.flag, l.name_pt, count(s.id)::int as sessions from languages l
       left join game_sessions s on s.language_code = l.code and s.started_at > now() - interval '30 days'
      group by l.code order by sessions desc, l.sort_order`,
  );
  const hardestItems = await query<{ id: number; text: string; language_code: string; wrong: number; total: number }>(
    `select ci.id, ci.text, ci.language_code, count(*) filter (where si.result = 'wrong')::int as wrong, count(*)::int as total
       from session_items si join content_items ci on ci.id = si.item_id
      where si.answered_at > now() - interval '30 days' and si.result is not null and not si.excluded
      group by ci.id having count(*) >= 5
      order by (count(*) filter (where si.result = 'wrong'))::float / count(*) desc limit 10`,
  );
  return { ...m, content, editorial, popularLanguages, hardestItems };
}

// ---------------------------------------------------------------------------
// Conteúdo
// ---------------------------------------------------------------------------

const FORMATS = ["translate", "write", "listen", "speak"] as const;
const answerList = z.array(z.string().trim().min(1).max(200)).max(30);

export const itemSchema = z.object({
  languageCode: z.string().regex(/^[a-z]{2,3}$/),
  categorySlug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  levelCode: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  kind: z.enum(["word", "phrase"]),
  text: z.string().trim().min(1).max(200),
  translationPt: z.string().trim().min(1).max(200),
  explanation: z.string().trim().max(500).nullable().optional(),
  exampleText: z.string().trim().max(300).nullable().optional(),
  examplePt: z.string().trim().max(300).nullable().optional(),
  formats: z.array(z.enum(FORMATS)).min(1),
  reviewStatus: z.enum(["draft", "pending_review", "approved", "archived"]).default("pending_review"),
  source: z.string().trim().min(2).max(300),
  /** Procedência: "ai_assisted" marca conteúdo redigido com apoio de IA (exige revisão humana para ser aprovado). */
  origin: z.enum(["ai_assisted", "human", "imported"]).default("human"),
  altTarget: answerList.default([]),
  altPt: answerList.default([]),
});

export const itemFilterSchema = z.object({
  language: z.string().regex(/^[a-z]{2,3}$/).optional(),
  status: z.enum(["draft", "pending_review", "approved", "archived"]).optional(),
  category: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export async function listItems(f: z.infer<typeof itemFilterSchema>, pageSize = 30) {
  const rows = await query<{
    id: number;
    language_code: string;
    category_slug: string;
    level_code: string;
    kind: string;
    text: string;
    translation_pt: string;
    review_status: string;
    formats: string[];
    answers: number;
    audio: number;
    updated_at: Date;
  }>(
    `select i.id, i.language_code, i.category_slug, i.level_code, i.kind, i.text, i.translation_pt, i.review_status, i.formats, i.updated_at,
            (select count(*)::int from accepted_answers a where a.item_id = i.id) as answers,
            (select count(*)::int from audio_assets a where a.item_id = i.id) as audio
       from content_items i
      where ($1::text is null or i.language_code = $1)
        and ($2::text is null or i.review_status = $2)
        and ($3::text is null or i.category_slug = $3)
        and ($4::text is null or i.text ilike '%' || $4 || '%' or i.translation_pt ilike '%' || $4 || '%')
      order by i.updated_at desc, i.id desc
      limit $5 offset $6`,
    [f.language ?? null, f.status ?? null, f.category ?? null, f.q ?? null, pageSize + 1, (f.page - 1) * pageSize],
  );
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

export async function getItem(id: number) {
  const item = await queryOne<{
    id: number;
    language_code: string;
    category_slug: string;
    level_code: string;
    kind: string;
    text: string;
    translation_pt: string;
    explanation: string | null;
    example_text: string | null;
    example_pt: string | null;
    formats: string[];
    review_status: string;
    source: string;
    origin: string;
    reviewed_at: Date | null;
    reviewer: string | null;
  }>(
    `select i.*, p.nickname as reviewer from content_items i left join profiles p on p.user_id = i.reviewed_by where i.id = $1`,
    [id],
  );
  if (!item) return null;
  const answers = await query<{ direction: string; answer: string; is_primary: boolean }>(
    `select direction, answer, is_primary from accepted_answers where item_id = $1 order by is_primary desc, id`,
    [id],
  );
  const audio = await query<{ id: number; url: string; kind: string; locale: string; license: string | null; source: string | null; review_status: string }>(
    `select id, url, kind, locale, license, source, review_status from audio_assets where item_id = $1 order by id`,
    [id],
  );
  return {
    ...item,
    altTarget: answers.filter((a) => a.direction === "to_target" && !a.is_primary).map((a) => a.answer),
    altPt: answers.filter((a) => a.direction === "to_pt" && !a.is_primary).map((a) => a.answer),
    audio,
  };
}

async function upsertItem(id: number | null, input: z.infer<typeof itemSchema>, actorId: string, meta: Meta) {
  return tx(async (client) => {
    const unit = await client.query<{ id: number }>(
      `insert into units (language_code, level_code, category_slug, title, sort_order)
       values ($1,$2,$3,(select name_pt from categories where slug = $3) || ' · ' || $2, (select sort_order from categories where slug = $3))
       on conflict (language_code, level_code, category_slug) do update set title = units.title returning id`,
      [input.languageCode, input.levelCode, input.categorySlug],
    );
    const reviewed = input.reviewStatus === "approved";
    const values = [
      input.languageCode,
      unit.rows[0].id,
      input.categorySlug,
      input.levelCode,
      input.kind,
      input.text,
      input.translationPt,
      input.explanation || null,
      input.exampleText || null,
      input.examplePt || null,
      input.formats,
      input.reviewStatus,
      input.source,
      reviewed ? actorId : null,
      input.origin,
    ];
    let itemId: number;
    try {
      if (id == null) {
        const r = await client.query<{ id: number }>(
          `insert into content_items (language_code, unit_id, category_slug, level_code, kind, text, translation_pt, explanation, example_text,
                                      example_pt, formats, review_status, source, reviewed_by, reviewed_at, origin)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, case when $14::uuid is null then null else now() end, $15) returning id`,
          values,
        );
        itemId = r.rows[0].id;
      } else {
        const r = await client.query<{ id: number }>(
          `update content_items set language_code = $1, unit_id = $2, category_slug = $3, level_code = $4, kind = $5, text = $6,
                  translation_pt = $7, explanation = $8, example_text = $9, example_pt = $10, formats = $11, review_status = $12,
                  source = $13, reviewed_by = coalesce($14, reviewed_by),
                  reviewed_at = case when $14::uuid is null then reviewed_at else now() end, origin = $15, updated_at = now()
            where id = $16 returning id`,
          [...values, id],
        );
        if (!r.rows[0]) throw notFound("Item não encontrado.");
        itemId = id;
        await client.query(`delete from accepted_answers where item_id = $1`, [itemId]);
      }
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw conflict("duplicate_item", "Já existe um item com este texto neste idioma.");
      if ((err as { code?: string }).code === "23503") throw badRequest("invalid_reference", "Idioma ou categoria inexistente.");
      throw err;
    }
    const answers: [string, string, boolean][] = [
      ["to_target", input.text, true],
      ...input.altTarget.map((a): [string, string, boolean] => ["to_target", a, false]),
      ["to_pt", input.translationPt, true],
      ...input.altPt.map((a): [string, string, boolean] => ["to_pt", a, false]),
    ];
    for (const [direction, answer, primary] of answers) {
      await client.query(`insert into accepted_answers (item_id, direction, answer, is_primary) values ($1,$2,$3,$4) on conflict do nothing`, [
        itemId,
        direction,
        answer,
        primary,
      ]);
    }
    await audit(actorId, id == null ? "content.item_created" : "content.item_updated", { type: "content_item", id: itemId }, { text: input.text, status: input.reviewStatus }, meta.ip, client);
    return itemId;
  });
}

export const createItem = (input: z.infer<typeof itemSchema>, actorId: string, meta: Meta) => upsertItem(null, input, actorId, meta);
export const updateItem = (id: number, input: z.infer<typeof itemSchema>, actorId: string, meta: Meta) => upsertItem(id, input, actorId, meta);

export async function setItemReviewStatus(id: number, status: "draft" | "pending_review" | "approved" | "archived", actorId: string, meta: Meta) {
  const r = await query(
    `update content_items set review_status = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now() where id = $1 returning id`,
    [id, status, actorId],
  );
  if (!r.length) throw notFound("Item não encontrado.");
  await audit(actorId, "content.item_review", { type: "content_item", id }, { status }, meta.ip);
}

export const audioSchema = z.object({
  url: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u.startsWith("/") || u.startsWith("https://"), "Use um caminho local (/audio/...) ou uma URL https://"),
  kind: z.enum(["recorded", "synthetic"]),
  locale: z.string().regex(/^[a-z]{2,3}-[A-Z]{2}$/),
  voice: z.string().max(100).optional(),
  license: z.string().max(200).optional(),
  source: z.string().max(300).optional(),
});

export async function addAudio(itemId: number, input: z.infer<typeof audioSchema>, actorId: string, meta: Meta) {
  const r = await queryOne<{ id: number }>(
    `insert into audio_assets (item_id, url, kind, locale, voice, license, source) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [itemId, input.url, input.kind, input.locale, input.voice ?? null, input.license ?? null, input.source ?? null],
  ).catch((err) => {
    if (err.code === "23503") throw notFound("Item não encontrado.");
    throw err;
  });
  await audit(actorId, "content.audio_added", { type: "content_item", id: itemId }, { url: input.url }, meta.ip);
  return r!.id;
}

export async function removeAudio(audioId: number, actorId: string, meta: Meta) {
  const r = await query(`delete from audio_assets where id = $1 returning item_id`, [audioId]);
  if (!r.length) throw notFound("Áudio não encontrado.");
  await audit(actorId, "content.audio_removed", { type: "audio_asset", id: audioId }, undefined, meta.ip);
}

// ---------------------------------------------------------------------------
// Idiomas e categorias
// ---------------------------------------------------------------------------

export const languageSchema = z.object({
  code: z.string().regex(/^[a-z]{2,3}$/, "Código ISO 639 de 2 ou 3 letras minúsculas."),
  namePt: z.string().trim().min(2).max(40),
  nativeName: z.string().trim().min(2).max(40),
  flag: z.string().trim().min(1).max(16),
  locale: z.string().regex(/^[a-z]{2,3}-[A-Z]{2}$/, "Use o formato BCP 47, ex.: pt-BR"),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(100),
});

export async function upsertLanguage(input: z.infer<typeof languageSchema>, actorId: string, meta: Meta) {
  await query(
    `insert into languages (code, name_pt, native_name, flag, locale, is_active, sort_order) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (code) do update set name_pt = excluded.name_pt, native_name = excluded.native_name, flag = excluded.flag,
       locale = excluded.locale, is_active = excluded.is_active, sort_order = excluded.sort_order`,
    [input.code, input.namePt, input.nativeName, input.flag, input.locale, input.isActive, input.sortOrder],
  );
  await audit(actorId, "content.language_saved", { type: "language", id: input.code }, input, meta.ip);
}

export const categorySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/, "Use letras minúsculas, números e hífen."),
  namePt: z.string().trim().min(2).max(60),
  icon: z.string().trim().min(1).max(16),
  sortOrder: z.number().int().min(0).max(1000).default(100),
});

export async function upsertCategory(input: z.infer<typeof categorySchema>, actorId: string, meta: Meta) {
  await query(
    `insert into categories (slug, name_pt, icon, sort_order) values ($1,$2,$3,$4)
     on conflict (slug) do update set name_pt = excluded.name_pt, icon = excluded.icon, sort_order = excluded.sort_order`,
    [input.slug, input.namePt, input.icon, input.sortOrder],
  );
  await audit(actorId, "content.category_saved", { type: "category", id: input.slug }, input, meta.ip);
}

// ---------------------------------------------------------------------------
// Temporadas e regras de pontuação
// ---------------------------------------------------------------------------

export const newSeasonSchema = z.object({
  name: z.string().trim().min(3).max(80),
  endsAt: z.coerce.date().refine((d) => d.getTime() > Date.now() + 3600_000, "A nova temporada precisa terminar no futuro."),
});

export async function startNewSeason(input: z.infer<typeof newSeasonSchema>, actorId: string, meta: Meta) {
  const season = await closeActiveSeasonNow(input.name, input.endsAt);
  await audit(actorId, "season.started", { type: "season", id: season.id }, { name: input.name, endsAt: input.endsAt.toISOString() }, meta.ip);
  return season;
}

export async function updateScoringRules(raw: unknown, actorId: string, meta: Meta) {
  const parsed = scoringRulesSchema.parse(raw);
  const mins = parsed.leagues.map((l) => l.min);
  if (mins[0] !== 0 || mins.some((m, i) => i > 0 && m <= mins[i - 1])) {
    throw badRequest("invalid_leagues", "As ligas devem começar em 0 e ter pontuações mínimas crescentes.");
  }
  const saved = await saveScoringRules(parsed, actorId);
  await audit(actorId, "settings.scoring_updated", { type: "settings", id: "scoring" }, { version: saved.version }, meta.ip);
  return saved;
}

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

export async function listUsers(q: string | undefined, page: number, pageSize = 30) {
  const rows = await query<{
    id: string;
    email: string;
    nickname: string;
    role: string;
    status: string;
    suspended_reason: string | null;
    created_at: Date;
    xp_total: number;
    sessions_count: number;
    is_demo: boolean;
  }>(
    `select u.id, u.email, p.nickname, u.role, u.status, u.suspended_reason, u.created_at, coalesce(s.xp_total, 0) as xp_total,
            coalesce(s.sessions_count, 0) as sessions_count, p.is_demo
       from users u join profiles p on p.user_id = u.id left join user_stats s on s.user_id = u.id
      where ($1::text is null or u.email ilike '%' || $1 || '%' or p.nickname ilike '%' || $1 || '%')
      order by u.created_at desc limit $2 offset $3`,
    [q || null, pageSize + 1, (page - 1) * pageSize],
  );
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

export const moderationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), reason: z.string().trim().min(10, "Descreva o motivo (mín. 10 caracteres).").max(500) }),
  z.object({ action: z.literal("reactivate"), reason: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("set_role"), role: z.enum(["user", "admin"]) }),
]);

export async function moderateUser(targetId: string, input: z.infer<typeof moderationSchema>, actorId: string, meta: Meta) {
  if (!z.uuid().safeParse(targetId).success) throw notFound("Usuário não encontrado.");
  if (targetId === actorId) throw badRequest("self_action", "Você não pode alterar a própria conta por aqui.");
  const target = await queryOne<{ role: string }>(`select role from users where id = $1`, [targetId]);
  if (!target) throw notFound("Usuário não encontrado.");
  await tx(async (client) => {
    if (input.action === "suspend") {
      if (target.role === "admin") throw badRequest("admin_target", "Remova o papel de administrador antes de suspender.");
      await client.query(`update users set status = 'suspended', suspended_reason = $2, updated_at = now() where id = $1`, [targetId, input.reason]);
      await client.query(`delete from auth_sessions where user_id = $1`, [targetId]);
    } else if (input.action === "reactivate") {
      await client.query(`update users set status = 'active', suspended_reason = null, updated_at = now() where id = $1`, [targetId]);
    } else {
      await client.query(`update users set role = $2, updated_at = now() where id = $1`, [targetId, input.role]);
    }
    await audit(actorId, `user.${input.action}`, { type: "user", id: targetId }, input, meta.ip, client);
  });
}

// ---------------------------------------------------------------------------
// Registros
// ---------------------------------------------------------------------------

export async function getLogs() {
  const events = await query<{ id: number; level: string; source: string; message: string; context: unknown; created_at: Date }>(
    `select id, level, source, message, context, created_at from app_events order by created_at desc limit 100`,
  );
  const audits = await query<{ id: number; actor: string | null; action: string; target_type: string | null; target_id: string | null; details: unknown; created_at: Date }>(
    `select a.id, p.nickname as actor, a.action, a.target_type, a.target_id, a.details, a.created_at
       from audit_logs a left join profiles p on p.user_id = a.actor_id order by a.created_at desc limit 100`,
  );
  const emails = await query<{ id: number; to_email: string; subject: string; transport: string; status: string; created_at: Date }>(
    `select id, to_email, subject, transport, status, created_at from email_outbox order by created_at desc limit 30`,
  );
  return { events, audits, emails };
}
