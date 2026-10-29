import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { badRequest } from "@/lib/server/errors";
import { json, route } from "@/lib/server/http";
import { listMissions } from "@/lib/server/missions";

export const GET = route(async (req) => {
  const user = await apiUser();
  const language = z.string().regex(/^[a-z]{2,3}$/).nullable().parse(new URL(req.url).searchParams.get("language")) ?? user.currentLanguage;
  if (!language) throw badRequest("language_required", "Escolha um idioma primeiro.");
  return json(await listMissions(user.id, language), { headers: { "Cache-Control": "private, no-store" } });
});
