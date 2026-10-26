import { z } from "zod";
import { setVoiceConsent } from "@/lib/server/accounts";
import { apiUser, requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const user = await apiUser();
  const { consent } = await parseJson(req, z.object({ consent: z.boolean() }));
  await setVoiceConsent(user.id, consent, await requestMeta());
  return json({ ok: true, consent });
});
