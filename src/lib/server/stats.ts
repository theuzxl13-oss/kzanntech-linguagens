import { query } from "./db";

/** Estatísticas detalhadas (Premium). Todas as consultas filtram pelo próprio usuário. */
export async function getDetailedStats(userId: string) {
  const [byMode, byResult, weekly, hardest, lessons] = await Promise.all([
    query<{ language_code: string; mode: string; format: string; sessions: number; accuracy: number | null; avg_score: number | null }>(
      `select language_code, mode, format, count(*)::int as sessions, avg(accuracy)::float as accuracy, avg(raw_score)::float as avg_score
         from game_sessions where user_id = $1 and status = 'finished' and started_at > now() - interval '30 days'
        group by language_code, mode, format order by language_code, mode, format`,
      [userId],
    ),
    query<{ result: string; n: number }>(
      `select result, count(*)::int as n from answers where user_id = $1 and created_at > now() - interval '30 days' group by result`,
      [userId],
    ),
    query<{ week: Date; sessions: number; answers: number; correct: number }>(
      `select date_trunc('week', a.created_at) as week, count(distinct a.session_id)::int as sessions, count(*)::int as answers,
              count(*) filter (where a.result in ('correct','accent'))::int as correct
         from answers a where a.user_id = $1 and a.created_at > now() - interval '8 weeks'
        group by 1 order by 1`,
      [userId],
    ),
    query<{ text: string; translation: string; language_code: string; misses: number; tries: number }>(
      `select ci.text, ci.translation_pt as translation, ci.language_code,
              count(*) filter (where a.result in ('wrong','skipped'))::int as misses, count(*)::int as tries
         from answers a join session_items si on si.session_id = a.session_id and si.idx = a.idx
         join content_items ci on ci.id = si.item_id
        where a.user_id = $1 and a.created_at > now() - interval '90 days'
        group by ci.id having count(*) filter (where a.result in ('wrong','skipped')) > 0
        order by misses desc, tries desc limit 10`,
      [userId],
    ),
    query<{ level_code: string; done: number; avg_accuracy: number | null }>(
      `select u.level_code, count(*)::int as done, avg(ul.best_accuracy)::float as avg_accuracy
         from user_lessons ul join units u on u.id = ul.unit_id where ul.user_id = $1 group by u.level_code order by u.level_code`,
      [userId],
    ),
  ]);
  return { byMode, byResult, weekly, hardest, lessons };
}
