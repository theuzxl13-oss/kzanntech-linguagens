import { apiUser } from "@/lib/server/auth";
import { answerSchema, submitTypingAnswer } from "@/lib/server/game/sessions";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  return json(await submitTypingAnswer(user.id, id, await parseJson(req, answerSchema)));
});
