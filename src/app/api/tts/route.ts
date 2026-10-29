import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";
import { notFound } from "@/lib/server/errors";
import { resolveItemAudio } from "@/lib/server/game/sessions";
import { route } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";

/** Áudio de referência para o vocabulário (texto já visível ao usuário). */
export const GET = route(async (req) => {
  const user = await apiUser();
  await enforceRateLimit(`tts:${user.id}`, 90, 60);
  const itemId = z.coerce.number().int().positive().parse(new URL(req.url).searchParams.get("item"));
  const item = await queryOne<{ text: string; locale: string; has_asset: boolean }>(
    `select i.text, l.locale, exists (select 1 from audio_assets a where a.item_id = i.id and a.review_status <> 'archived') as has_asset
       from content_items i join languages l on l.code = i.language_code where i.id = $1 and i.review_status in ('pending_review','approved')`,
    [itemId],
  );
  if (!item) throw notFound("Item não encontrado.");
  const audio = await resolveItemAudio(itemId, item.text, item.locale, item.has_asset ? "asset" : "server_tts", 1, user.id);
  return new Response(new Uint8Array(audio.audio), { headers: { "Content-Type": audio.contentType, "Cache-Control": "private, max-age=3600" } });
});
