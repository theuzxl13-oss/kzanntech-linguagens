import "./env";
import type { PoolClient } from "pg";
import { ACHIEVEMENTS, CATEGORIES, CONCEPTS, CONTENT_SOURCE, LANGUAGES, LEVELS, type Translation } from "../db/seed/content";
import { closePool, tx } from "../src/lib/server/db";
import { hashPassword } from "../src/lib/server/password";
import { monthNamePt, startOfMonthUtc, startOfNextMonthUtc } from "../src/lib/domain/dates";

function unpack(tr: Translation) {
  return typeof tr === "string" ? { t: tr, alt: [] as string[], pt: [] as string[], note: undefined } : { alt: [], pt: [], ...tr };
}

export async function seedCatalog(client: PoolClient, log = console.log) {
  for (const l of LANGUAGES) {
    await client.query(
      `insert into languages (code, name_pt, native_name, flag, locale, sort_order) values ($1,$2,$3,$4,$5,$6)
       on conflict (code) do nothing`,
      [l.code, l.name_pt, l.native_name, l.flag, l.locale, l.sort_order],
    );
  }
  for (const l of LEVELS) {
    await client.query(
      `insert into levels (code, name_pt, description, sort_order, difficulty, rank_weight) values ($1,$2,$3,$4,$5,$6)
       on conflict (code) do update set name_pt = excluded.name_pt, description = excluded.description`,
      [l.code, l.name_pt, l.description, l.sort_order, l.difficulty, l.rank_weight],
    );
  }
  for (const c of CATEGORIES) {
    await client.query(
      `insert into categories (slug, name_pt, icon, sort_order) values ($1,$2,$3,$4) on conflict (slug) do nothing`,
      [c.slug, c.name_pt, c.icon, c.sort_order],
    );
  }
  for (const [i, a] of ACHIEVEMENTS.entries()) {
    await client.query(
      `insert into achievements (code, name_pt, description_pt, icon, xp_reward, sort_order) values ($1,$2,$3,$4,$5,$6)
       on conflict (code) do update set name_pt = excluded.name_pt, description_pt = excluded.description_pt,
         icon = excluded.icon, xp_reward = excluded.xp_reward, sort_order = excluded.sort_order`,
      [a.code, a.name_pt, a.description_pt, a.icon, a.xp_reward, i],
    );
  }

  const catName = new Map<string, string>(CATEGORIES.map((c) => [c.slug, c.name_pt]));
  let created = 0;
  for (const concept of CONCEPTS) {
    for (const lang of LANGUAGES) {
      const tr = unpack(concept.tr[lang.code]);
      const unit = await client.query<{ id: number }>(
        `insert into units (language_code, level_code, category_slug, title, sort_order)
         values ($1,$2,$3,$4,(select sort_order from categories where slug = $3))
         on conflict (language_code, level_code, category_slug) do update set title = units.title
         returning id`,
        [lang.code, concept.level, concept.cat, `${catName.get(concept.cat)} · ${concept.level}`],
      );
      const item = await client.query<{ id: number }>(
        `insert into content_items (language_code, unit_id, category_slug, level_code, kind, text, translation_pt, explanation, source, origin)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ai_assisted')
         on conflict (language_code, lower(text)) do nothing
         returning id`,
        [lang.code, unit.rows[0].id, concept.cat, concept.level, concept.kind, tr.t, concept.pt, tr.note ?? null, CONTENT_SOURCE],
      );
      if (!item.rows[0]) continue; // já existe: preserva edições feitas no painel administrativo
      created++;
      const id = item.rows[0].id;
      const answers: [string, string, boolean][] = [
        ["to_target", tr.t, true],
        ...tr.alt.map((a): [string, string, boolean] => ["to_target", a, false]),
        ["to_pt", concept.pt, true],
        ...(concept.ptAlt ?? []).map((a): [string, string, boolean] => ["to_pt", a, false]),
        ...tr.pt.map((a): [string, string, boolean] => ["to_pt", a, false]),
      ];
      for (const [direction, answer, isPrimary] of answers) {
        await client.query(
          `insert into accepted_answers (item_id, direction, answer, is_primary) values ($1,$2,$3,$4) on conflict do nothing`,
          [id, direction, answer, isPrimary],
        );
      }
    }
  }
  log(`✔ catálogo: ${LANGUAGES.length} idiomas, ${CATEGORIES.length} categorias, ${created} novos itens de conteúdo`);

  const now = new Date();
  const active = await client.query("select 1 from seasons where status = 'active'");
  if (!active.rowCount) {
    await client.query(`insert into seasons (name, starts_at, ends_at, status) values ($1,$2,$3,'active')`, [
      `Temporada de ${monthNamePt(now)}`,
      startOfMonthUtc(now),
      startOfNextMonthUtc(now),
    ]);
    log("✔ temporada ativa criada");
  }
}

export async function seedAdmin(client: PoolClient, email: string, password: string, log = console.log) {
  const existing = await client.query<{ id: string }>("select id from users where email = $1", [email]);
  if (existing.rows[0]) {
    await client.query("update users set role = 'admin' where id = $1", [existing.rows[0].id]);
    log(`✔ usuário ${email} promovido a administrador`);
    return existing.rows[0].id;
  }
  const hash = await hashPassword(password);
  const u = await client.query<{ id: string }>(
    `insert into users (email, password_hash, role, email_verified_at) values ($1,$2,'admin', now()) returning id`,
    [email, hash],
  );
  await client.query(`insert into profiles (user_id, nickname, avatar, avatar_color, onboarded_at) values ($1,'admin','owl','slate', now())`, [u.rows[0].id]);
  await client.query(`insert into user_stats (user_id) values ($1)`, [u.rows[0].id]);
  log(`✔ administrador criado: ${email}`);
  return u.rows[0].id;
}

/**
 * Dados de DEMONSTRAÇÃO (somente com --demo). Os usuários são marcados com is_demo = true
 * e aparecem com o selo "DEMO" nos rankings. Nunca use em produção.
 */
export async function seedDemo(client: PoolClient, log = console.log) {
  const names = ["demo_lia", "demo_rafa", "demo_bia", "demo_teo", "demo_nina", "demo_caio"];
  const avatars = ["cat", "fox", "panda", "owl", "rabbit", "bear"];
  const hash = await hashPassword("demo-password-" + Math.random());
  const season = await client.query<{ id: number }>("select id from seasons where status = 'active'");
  let n = 0;
  for (const [i, nick] of names.entries()) {
    const exists = await client.query("select 1 from profiles where nickname = $1", [nick]);
    if (exists.rowCount) continue;
    const u = await client.query<{ id: string }>(
      `insert into users (email, password_hash, email_verified_at) values ($1,$2,now()) returning id`,
      [`${nick}@demo.keylingo.invalid`, hash],
    );
    const id = u.rows[0].id;
    await client.query(
      `insert into profiles (user_id, nickname, avatar, avatar_color, current_language, is_demo, onboarded_at) values ($1,$2,$3,'teal','en',true, now())`,
      [id, nick, avatars[i]],
    );
    await client.query(`insert into user_stats (user_id, xp_total, level) values ($1, $2, $3)`, [id, 150 * (i + 1), 1 + i]);
    for (let s = 0; s < 4; s++) {
      for (const mode of ["typing", "voice"] as const) {
        if (mode === "voice" && i % 3 === 2) continue;
        const pts = 350 + ((i * 97 + s * 53 + (mode === "voice" ? 31 : 0)) % 400);
        const ago = (s + 1) * (i + 1) * 3600_000;
        await client.query(
          `insert into game_sessions (user_id, language_code, mode, format, kind, preset, target_count, status, started_at,
             expires_at, finished_at, season_id, rules_version, rank_points, raw_score, answered_count, correct_count, accuracy, verification)
           values ($1,'en',$2,$3,'ranked','quick',10,'finished', now() - make_interval(secs => $4/1000.0 + 300),
             now(), now() - make_interval(secs => $4/1000.0), $5, 1, $6, $6, 10, 8, 0.8, 'server')`,
          [id, mode, mode === "voice" ? "speak" : "mixed", ago, season.rows[0]?.id ?? null, pts],
        );
      }
    }
    n++;
  }
  log(`✔ ${n} usuários de demonstração criados (marcados como DEMO)`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  await tx(async (client) => {
    await seedCatalog(client);
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      await seedAdmin(client, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    }
    if (args.has("--demo")) await seedDemo(client);
  });
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main()
    .then(() => closePool())
    .catch(async (err) => {
      console.error(err);
      await closePool();
      process.exit(1);
    });
}
