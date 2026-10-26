import { apiUser } from "@/lib/server/auth";
import { finishSchema, finishSession } from "@/lib/server/game/finish";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, finishSchema);
  return json(await finishSession(user.id, id, reason));
});
