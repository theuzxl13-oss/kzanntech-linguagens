import { apiUser } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { startMission } from "@/lib/server/missions";

export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  return json(await startMission(user.id, (await ctx.params).id), 201);
});
