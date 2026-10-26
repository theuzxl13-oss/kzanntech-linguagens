import { apiUser } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { getRanking, rankingQuerySchema } from "@/lib/server/rankings";

export const GET = route(async (req) => {
  const user = await apiUser();
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const q = rankingQuerySchema.parse({ ...sp, language: sp.language || null });
  return json(await getRanking(q, user.id));
});
