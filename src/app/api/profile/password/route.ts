import { changePassword, changePasswordSchema } from "@/lib/server/accounts";
import { apiUser, requestMeta, setSessionCookie } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const user = await apiUser();
  const r = await changePassword(user.id, await parseJson(req, changePasswordSchema), await requestMeta());
  await setSessionCookie(r.token);
  return json({ ok: true });
});
