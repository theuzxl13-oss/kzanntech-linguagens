import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { selectLanguage } from "@/lib/server/content";
import { badRequest } from "@/lib/server/errors";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const user = await apiUser();
  const input = await parseJson(
    req,
    z.object({ language: z.string().regex(/^[a-z]{2,3}$/), level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional() }),
  );
  const lang = await selectLanguage(user.id, input.language, input.level);
  if (!lang) throw badRequest("invalid_language", "Idioma indisponível.");
  return json({ ok: true });
});
