import { apiUser } from "@/lib/server/auth";
import { notFound } from "@/lib/server/errors";
import { json, route } from "@/lib/server/http";
import { getAttemptView } from "@/lib/server/missions";

export const GET = route(async (_req, ctx: { params: Promise<{ attemptId: string }> }) => {
  const user = await apiUser();
  const view = await getAttemptView(user.id, (await ctx.params).attemptId);
  if (!view) throw notFound("Missão não encontrada.");
  return json(view, { headers: { "Cache-Control": "private, no-store" } });
});
