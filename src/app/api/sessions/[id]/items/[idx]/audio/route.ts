import { apiUser } from "@/lib/server/auth";
import { getItemAudio } from "@/lib/server/game/sessions";
import { route } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export const GET = route(async (req, ctx: { params: Promise<{ id: string; idx: string }> }) => {
  const user = await apiUser();
  await enforceRateLimit(`tts:${user.id}`, 90, 60);
  const { id, idx } = await ctx.params;
  const rate = Math.min(1.5, Math.max(0.5, Number(new URL(req.url).searchParams.get("rate") ?? 1) || 1));
  const audio = await getItemAudio(user.id, id, Number(idx), rate);
  return new Response(new Uint8Array(audio.audio), {
    headers: { "Content-Type": audio.contentType, "Cache-Control": "private, max-age=600" },
  });
});
