import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { serveItem } from "@/lib/server/game/sessions";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const { idx } = await parseJson(req, z.object({ idx: z.number().int().min(0).max(500) }));
  return json(await serveItem(user.id, id, idx));
});
