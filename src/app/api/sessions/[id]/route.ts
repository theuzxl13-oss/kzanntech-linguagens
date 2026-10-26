import { apiUser } from "@/lib/server/auth";
import { getSessionView } from "@/lib/server/game/sessions";
import { json, route } from "@/lib/server/http";

export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  return json(await getSessionView(user.id, id), { headers: { "Cache-Control": "no-store" } });
});
