import type { PoolClient } from "pg";
import type { ItemFormat, Mode, SessionKind, TypingFormat } from "../../domain/presets";
import { conflict } from "../errors";
import { PLAYABLE_STATUSES } from "../content";

export type AudioSource = "asset" | "server_tts" | "browser_tts" | "none";

export interface SelectedItem {
  itemId: number;
  format: ItemFormat;
  isReview: boolean;
  audioSource: AudioSource;
}

interface Candidate {
  id: number;
  level_code: string;
  level_order: number;
  formats: string[];
  kind: string;
  has_asset: boolean;
  progress: boolean;
  due: boolean;
  wrong_count: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface SelectionInput {
  userId: string;
  language: string;
  mode: Mode;
  format: TypingFormat | "speak";
  kind: SessionKind;
  poolSize: number;
  levelCode: string;
  unitId?: number | null;
  focus?: "review" | null;
  serverTts: boolean;
}

/**
 * Seleção adaptativa de exercícios:
 *  - até 40% de revisões vencidas (revisão espaçada), priorizando as mais atrasadas;
 *  - itens novos do nível atual do usuário;
 *  - o restante sorteado com peso maior para itens em que o usuário já errou;
 *  - em sessões ranqueadas, o formato de escuta só usa áudio servido pelo servidor
 *    (o texto nunca é enviado ao navegador antes da resposta).
 */
export async function selectItems(client: PoolClient, input: SelectionInput): Promise<SelectedItem[]> {
  const needFormats: ItemFormat[] =
    input.mode === "voice" ? ["speak"] : input.format === "mixed" ? ["translate", "write", "listen"] : [input.format as ItemFormat];

  const levelOrder =
    (await client.query<{ sort_order: number }>(`select sort_order from levels where code = $1`, [input.levelCode])).rows[0]?.sort_order ?? 1;

  if (input.kind === "placement") return selectPlacement(client, input.language, input.poolSize);

  const res = await client.query<Candidate>(
    `select i.id, i.level_code, lv.sort_order as level_order, i.formats, i.kind,
            exists (select 1 from audio_assets a where a.item_id = i.id and a.review_status <> 'archived') as has_asset,
            (p.item_id is not null) as progress,
            coalesce(p.due_at <= now(), false) as due,
            coalesce(p.wrong_count, 0) as wrong_count
       from content_items i
       join levels lv on lv.code = i.level_code
       left join user_item_progress p on p.item_id = i.id and p.user_id = $1
      where i.language_code = $2
        and i.review_status = any($3)
        and i.formats && $4::text[]
        and ($5::int is null or i.unit_id = $5)`,
    [input.userId, input.language, PLAYABLE_STATUSES, needFormats, input.unitId ?? null],
  );
  let candidates = res.rows;

  const listenOk = (c: Candidate) => c.formats.includes("listen") && (input.kind !== "ranked" || c.has_asset || input.serverTts);
  if (input.mode === "typing" && input.format === "listen") {
    candidates = candidates.filter(listenOk);
    if (!candidates.length) {
      throw conflict(
        "listen_unavailable",
        input.kind === "ranked"
          ? "O modo competitivo de escuta exige áudio servido pelo servidor, que não está configurado. Use a prática livre."
          : "Não há exercícios de escuta disponíveis para este filtro.",
      );
    }
  }
  if (!candidates.length) throw conflict("no_content", "Ainda não há exercícios disponíveis para este idioma e filtro.");

  // Janela de nível: atual e anteriores; inclui o próximo se faltar conteúdo.
  let pool = candidates.filter((c) => c.level_order <= levelOrder);
  if (pool.length < input.poolSize) pool = candidates.filter((c) => c.level_order <= levelOrder + 1);
  if (pool.length === 0) pool = candidates;
  if (input.mode === "voice") {
    // Na fala, frases curtas e palavras alternadas; frases são priorizadas a partir do A2.
    pool = shuffle(pool);
  }

  const picked: Candidate[] = [];
  const used = new Set<number>();
  const take = (list: Candidate[], max: number) => {
    for (const c of list) {
      if (picked.length >= input.poolSize || max <= 0) break;
      if (used.has(c.id)) continue;
      picked.push(c);
      used.add(c.id);
      max--;
    }
  };
  const reviewShare = input.focus === "review" ? 1 : 0.4;
  take(shuffle(pool.filter((c) => c.due)), Math.ceil(input.poolSize * reviewShare));
  take(shuffle(pool.filter((c) => !c.progress && c.level_order === levelOrder)), Math.ceil(input.poolSize * 0.5));
  take(shuffle(pool.filter((c) => !c.progress)), Math.ceil(input.poolSize * 0.3));
  // Restante: sorteio ponderado por erros anteriores
  const weighted = [...pool].map((c) => ({ c, w: Math.random() * (1 + c.wrong_count) })).sort((a, b) => b.w - a.w).map((x) => x.c);
  take(weighted, input.poolSize);
  // Conteúdo insuficiente (ex.: desafios longos): repete itens em nova ordem
  while (picked.length < input.poolSize && pool.length) {
    for (const c of shuffle(pool)) {
      if (picked.length >= input.poolSize) break;
      if (picked[picked.length - 1]?.id === c.id) continue;
      picked.push(c);
    }
  }
  const ordered = input.focus === "review" ? picked : shuffle(picked);

  return ordered.map((c) => {
    let format: ItemFormat;
    if (input.mode === "voice") format = "speak";
    else if (input.format !== "mixed") format = input.format as ItemFormat;
    else {
      const options = (["translate", "write", "listen"] as ItemFormat[]).filter(
        (f) => c.formats.includes(f) && (f !== "listen" || listenOk(c)),
      );
      format = options[Math.floor(Math.random() * options.length)] ?? "translate";
    }
    const needsAudio = format === "listen" || format === "speak" || format === "translate";
    const audioSource: AudioSource = !needsAudio
      ? "none"
      : c.has_asset
        ? "asset"
        : input.serverTts
          ? "server_tts"
          : "browser_tts";
    return { itemId: c.id, format, isReview: c.due, audioSource };
  });
}

/** Teste de nivelamento: 3 traduções de cada nível A1–B2. */
async function selectPlacement(client: PoolClient, language: string, poolSize: number): Promise<SelectedItem[]> {
  const res = await client.query<{ id: number; level_code: string }>(
    `select id, level_code from (
       select i.id, i.level_code, row_number() over (partition by i.level_code order by random()) as rn
         from content_items i
        where i.language_code = $1 and i.review_status = any($2) and 'translate' = any(i.formats)
          and i.level_code in ('A1','A2','B1','B2')
     ) t where rn <= $3
     order by level_code, random()`,
    [language, PLAYABLE_STATUSES, Math.ceil(poolSize / 4)],
  );
  if (!res.rows.length) throw conflict("no_content", "Ainda não há conteúdo suficiente para o teste de nivelamento.");
  return res.rows.map((r) => ({ itemId: r.id, format: "translate", isReview: false, audioSource: "none" }));
}
