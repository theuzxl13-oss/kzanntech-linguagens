import { resetPassword, resetSchema } from "@/lib/server/accounts";
import { requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  await resetPassword(await parseJson(req, resetSchema), await requestMeta());
  return json({ ok: true });
});
