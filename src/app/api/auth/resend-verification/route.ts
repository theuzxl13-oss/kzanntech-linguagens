import { resendVerification } from "@/lib/server/accounts";
import { apiUser } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";

export const POST = route(async () => {
  const user = await apiUser();
  return json(await resendVerification(user.id));
});
