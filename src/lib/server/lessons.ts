import { z } from "zod";
import { addDays, localDate } from "../domain/dates";
import { LESSON_XP, buildPath, minLessonSeconds, type LessonData, type UnitForPath } from "../domain/lessons";
import { levelFromXp } from "../domain/scoring";
import { PLAYABLE_STATUSES, getLanguage, getUserLanguageLevel } from "./content";
import { query, queryOne, tx } from "./db";
import { conflict, notFound } from "./errors";
import { enforceRateLimit } from "./rate-limit";

export const completeLessonSchema = z.object({ accuracy: z.number().min(0).max(1) });

async function unitsForPath(language: string): Promise<UnitForPath[]> {
  return query<UnitForPath>(
    `select u.id as "unitId", u.title, c.icon, u.level_code as level, lv.sort_order as "levelOrder", count(i.id)::int as "itemCount"
       from units u
       join categories c on c.slug = u.category_slug
       join levels lv on lv.code = u.level_code
       join content_items i on i.unit_id = u.id and i.review_status = any($2)
      where u.language_code = $1
      group by u.id, c.icon, lv.sort_order, c.sort_order
      order by lv.sort_order, c.sort_order, u.id`,
    [language, PLAYABLE_STATUSES],
  );
}

export async function getLearningPath(userId: string, language: string) {
  const [units, done, levelCode, levelOrder] = await Promise.all([
    unitsForPath(language),
    query<{ unit_id: number; best_accuracy: number }>(`select unit_id, best_accuracy::float from user_lessons where user_id = $1`, [userId]),
    getUserLanguageLevel(userId, language),
    queryOne<{ sort_order: number }>(
      `select lv.sort_order from levels lv where lv.code = coalesce((select level_code from user_languages where user_id = $1 and language_code = $2), 'A1')`,
      [userId, language],
    ),
  ]);
  const completed = new Map(done.map((d) => [d.unit_id, d.best_accuracy]));
  const lessons = buildPath(units, completed, levelOrder?.sort_order ?? 1);
  return { levelCode, lessons };
}

export async function getLesson(userId: string, unitId: number): Promise<LessonData | null> {
  const unit = await queryOne<{ id: number; title: string; language_code: string; level_code: string; icon: string }>(
    `select u.id, u.title, u.language_code, u.level_code, c.icon from units u join categories c on c.slug = u.category_slug where u.id = $1`,
    [unitId],
  );
  if (!unit) return null;
  const lang = (await getLanguage(unit.language_code))!;
  const { lessons } = await getLearningPath(userId, unit.language_code);
  const idx = lessons.findIndex((l) => l.unitId === unitId);
  if (idx === -1 || lessons[idx].status === "locked") return null;
  const items = await query<{ id: number; text: string; translation: string; explanation: string | null; kind: string; alt_target: string[]; alt_pt: string[] }>(
    `select i.id, i.text, i.translation_pt as translation, i.explanation, i.kind,
            coalesce((select array_agg(a.answer) from accepted_answers a where a.item_id = i.id and a.direction = 'to_target' and not a.is_primary), '{}') as alt_target,
            coalesce((select array_agg(a.answer) from accepted_answers a where a.item_id = i.id and a.direction = 'to_pt' and not a.is_primary), '{}') as alt_pt
       from content_items i
      where i.unit_id = $1 and i.review_status = any($2)
      order by i.kind desc, i.id`,
    [unitId, PLAYABLE_STATUSES],
  );
  // Distratores para a múltipla escolha: outros itens do mesmo idioma e de nível próximo
  const others = await query<{ text: string; translation: string }>(
    `select i.text, i.translation_pt as translation from content_items i join levels lv on lv.code = i.level_code
      where i.language_code = $1 and i.unit_id <> $2 and i.review_status = any($3)
        and lv.sort_order <= (select sort_order from levels where code = $4) + 1
      order by random() limit 30`,
    [unit.language_code, unitId, PLAYABLE_STATUSES, unit.level_code],
  );
  return {
    unitId,
    title: unit.title,
    icon: unit.icon,
    level: unit.level_code,
    position: idx + 1,
    total: lessons.length,
    language: { code: lang.code, name: lang.name_pt, flag: lang.flag, locale: lang.locale },
    items: items.map((i) => ({ id: i.id, text: i.text, translation: i.translation, explanation: i.explanation, kind: i.kind, altTarget: i.alt_target, altPt: i.alt_pt })),
    distractors: { pt: others.map((o) => o.translation), target: others.map((o) => o.text) },
    completed: lessons[idx].status === "completed",
    nextUnitId: lessons[idx + 1]?.unitId ?? null,
  };
}

/** Registra no servidor o início de uma lição (pré-requisito para concluí-la). */
export async function startLesson(userId: string, unitId: number) {
  await enforceRateLimit(`lesson-start:${userId}`, 120, 3600);
  const lesson = await getLesson(userId, unitId);
  if (!lesson) throw notFound("Lição não encontrada ou ainda bloqueada.");
  await query(
    `insert into lesson_attempts (user_id, unit_id) values ($1,$2)
     on conflict (user_id, unit_id) do update set started_at = now()`,
    [userId, unitId],
  );
  return { ok: true };
}

/**
 * Registra a conclusão de uma lição. A precisão vem do navegador (lição é estudo, não competição):
 * ela só define as estrelas exibidas; o XP é fixo e limitado a uma concessão por lição por dia.
 */
export async function completeLesson(userId: string, unitId: number, accuracy: number) {
  await enforceRateLimit(`lesson:${userId}`, 60, 3600);
  const lesson = await getLesson(userId, unitId);
  if (!lesson) throw notFound("Lição não encontrada ou ainda bloqueada.");
  return tx(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`finish:${userId}`]);
    // A lição precisa ter sido iniciada no servidor e durado um tempo mínimo plausível
    const attempt = (
      await client.query<{ elapsed: number }>(
        `delete from lesson_attempts where user_id = $1 and unit_id = $2
         returning extract(epoch from now() - started_at)::float as elapsed`,
        [userId, unitId],
      )
    ).rows[0];
    if (!attempt) throw conflict("lesson_not_started", "Comece a lição antes de concluí-la.");
    if (attempt.elapsed < minLessonSeconds(lesson.items.length)) {
      throw conflict("lesson_too_fast", "A lição foi concluída rápido demais. Faça os exercícios para registrar o progresso.");
    }
    const tz = (await client.query<{ timezone: string }>(`select timezone from profiles where user_id = $1`, [userId])).rows[0]?.timezone ?? "America/Sao_Paulo";
    const today = localDate(new Date(), tz);
    const prev = (await client.query(`select 1 from user_lessons where user_id = $1 and unit_id = $2`, [userId, unitId])).rowCount;
    await client.query(
      `insert into user_lessons (user_id, unit_id, best_accuracy) values ($1,$2,$3)
       on conflict (user_id, unit_id) do update set last_completed_at = now(), times_completed = user_lessons.times_completed + 1,
         best_accuracy = greatest(user_lessons.best_accuracy, excluded.best_accuracy)`,
      [userId, unitId, accuracy],
    );
    const ref = prev ? `${unitId}:${today}` : String(unitId);
    // Teto de XP de lições por 24 h (estudar mais continua registrando progresso, só não soma XP)
    const lastDay = (
      await client.query<{ xp: number }>(
        `select coalesce(sum(amount), 0)::int as xp from xp_events where user_id = $1 and source = 'lesson' and created_at > now() - interval '24 hours'`,
        [userId],
      )
    ).rows[0].xp;
    const amount = Math.max(0, Math.min(prev ? LESSON_XP.repeat : LESSON_XP.first, LESSON_XP.dailyCap - lastDay));
    const ins = amount > 0
      ? await client.query(`insert into xp_events (user_id, source, ref, amount) values ($1,'lesson',$2,$3) on conflict do nothing`, [userId, ref, amount])
      : { rowCount: 0 };
    const xp = ins.rowCount ? amount : 0;

    // Itens apresentados entram na revisão espaçada (primeira revisão amanhã), sem apagar progresso existente
    await client.query(
      `insert into user_item_progress (user_id, item_id, reps, interval_days, last_seen_at, due_at)
       select $1, i.id, 1, 1, now(), now() + interval '1 day' from content_items i where i.unit_id = $2 and i.review_status = any($3)
       on conflict (user_id, item_id) do nothing`,
      [userId, unitId, PLAYABLE_STATUSES],
    );

    // Estudar a lição conta para a sequência de dias
    const stats = (await client.query(`select xp_total, current_streak, last_study_date from user_stats where user_id = $1 for update`, [userId])).rows[0];
    const last = stats?.last_study_date
      ? `${stats.last_study_date.getFullYear()}-${String(stats.last_study_date.getMonth() + 1).padStart(2, "0")}-${String(stats.last_study_date.getDate()).padStart(2, "0")}`
      : null;
    const streak = last === today ? stats.current_streak : last === addDays(today, -1) ? stats.current_streak + 1 : 1;
    const xpTotal = (stats?.xp_total ?? 0) + xp;
    await client.query(
      `update user_stats set xp_total = $2, level = $3, current_streak = $4, longest_streak = greatest(longest_streak, $4), last_study_date = $5, updated_at = now()
        where user_id = $1`,
      [userId, xpTotal, levelFromXp(xpTotal), streak, today],
    );
    await client.query(`update user_languages set last_studied_at = now() where user_id = $1 and language_code = $2`, [userId, lesson.language.code]);
    return { ok: true, xp, firstTime: !prev, nextUnitId: lesson.nextUnitId };
  });
}
