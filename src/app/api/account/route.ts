import { deleteAccount, deleteAccountSchema } from "@/lib/server/accounts";
import { apiUser, clearSessionCookie, requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const DELETE = route(async (req) => {
  const user = await apiUser();
  await deleteAccount(user.id, await parseJson(req, deleteAccountSchema), await requestMeta());
  await clearSessionCookie();
  return json({ ok: true });
});
