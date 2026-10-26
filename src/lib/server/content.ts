import { query, queryOne } from "./db";

export interface Language {
  code: string;
  name_pt: string;
  native_name: string;
  flag: string;
  locale: string;
  is_active: boolean;
}

export interface Level {
  code: string;
  name_pt: string;
  description: string;
  sort_order: number;
  difficulty: number;
  rank_weight: number;
}

/** Status de revisão que podem aparecer nos jogos (rascunhos e arquivados nunca aparecem). */
export const PLAYABLE_STATUSES = ["pending_review", "approved"];

export async function listLanguages(includeInactive = false): Promise<(Language & { item_count: number })[]> {
  return query(
    `select l.*, (select count(*)::int from content_items c where c.language_code = l.code and c.review_status = any($1)) as item_count
       from languages l ${includeInactive ? "" : "where l.is_active"} order by l.sort_order, l.name_pt`,
    [PLAYABLE_STATUSES],
  );
}

export async function getLanguage(code: string): Promise<Language | null> {
  return queryOne<Language>(`select * from languages where code = $1`, [code]);
}

export async function listLevels(): Promise<Level[]> {
  return query<Level>(`select code, name_pt, description, sort_order, difficulty::float, rank_weight::float from levels order by sort_order`);
}

export async function listCategories() {
  return query<{ slug: string; name_pt: string; icon: string; sort_order: number }>(`select * from categories order by sort_order`);
}

/** Unidades do idioma com progresso do usuário (itens aprendidos / total). */
export async function listUnitsWithProgress(userId: string, language: string) {
  return query<{
    id: number;
    title: string;
    level_code: string;
    category_slug: string;
    icon: string;
    total: number;
    learned: number;
    due: number;
  }>(
    `select u.id, u.title, u.level_code, u.category_slug, c.icon,
            count(i.id)::int as total,
            count(p.item_id) filter (where p.reps >= 2)::int as learned,
            count(p.item_id) filter (where p.due_at <= now())::int as due
       from units u
       join categories c on c.slug = u.category_slug
       join levels lv on lv.code = u.level_code
       join content_items i on i.unit_id = u.id and i.review_status = any($3)
       left join user_item_progress p on p.item_id = i.id and p.user_id = $1
      where u.language_code = $2
      group by u.id, c.icon, lv.sort_order, c.sort_order
      order by lv.sort_order, c.sort_order`,
    [userId, language, PLAYABLE_STATUSES],
  );
}

export async function getUserLanguageLevel(userId: string, language: string): Promise<string> {
  const row = await queryOne<{ level_code: string }>(`select level_code from user_languages where user_id = $1 and language_code = $2`, [
    userId,
    language,
  ]);
  return row?.level_code ?? "A1";
}

/** Define o idioma atual do usuário e o nível declarado (ou mantém o existente). */
export async function selectLanguage(userId: string, language: string, level?: string) {
  const lang = await getLanguage(language);
  if (!lang || !lang.is_active) return null;
  await query(
    `insert into user_languages (user_id, language_code, level_code) values ($1,$2,coalesce($3,'A1'))
     on conflict (user_id, language_code) do update set level_code = coalesce($3, user_languages.level_code)`,
    [userId, language, level ?? null],
  );
  await query(`update profiles set current_language = $2, updated_at = now() where user_id = $1`, [userId, language]);
  return lang;
}

/** Vocabulário estudado: significado, respostas aceitas e estado da revisão. */
export async function listVocabulary(userId: string, language: string, filter: "studied" | "all" | "difficult" = "studied") {
  const where =
    filter === "all" ? "" : filter === "difficult" ? "and p.item_id is not null and p.wrong_count > 0" : "and p.item_id is not null";
  return query<{
    id: number;
    text: string;
    translation_pt: string;
    explanation: string | null;
    kind: string;
    level_code: string;
    category: string;
    icon: string;
    review_status: string;
    alternatives: string[] | null;
    correct_count: number | null;
    wrong_count: number | null;
    reps: number | null;
    due_at: Date | null;
  }>(
    `select i.id, i.text, i.translation_pt, i.explanation, i.kind, i.level_code, c.name_pt as category, c.icon, i.review_status,
            (select array_agg(a.answer order by a.answer) from accepted_answers a where a.item_id = i.id and a.direction = 'to_target' and not a.is_primary) as alternatives,
            p.correct_count, p.wrong_count, p.reps, p.due_at
       from content_items i
       join categories c on c.slug = i.category_slug
       join levels lv on lv.code = i.level_code
       left join user_item_progress p on p.item_id = i.id and p.user_id = $1
      where i.language_code = $2 and i.review_status = any($3) ${where}
      order by lv.sort_order, c.sort_order, i.kind desc, i.text`,
    [userId, language, PLAYABLE_STATUSES],
  );
}

export async function getAcceptedAnswers(itemId: number, direction: "to_pt" | "to_target") {
  return query<{ answer: string; isPrimary: boolean }>(
    `select answer, is_primary as "isPrimary" from accepted_answers where item_id = $1 and direction = $2 order by is_primary desc, id`,
    [itemId, direction],
  );
}
