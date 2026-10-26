import { exportAccountData } from "@/lib/server/accounts";
import { apiUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export const GET = route(async () => {
  const user = await apiUser();
  await enforceRateLimit(`export:${user.id}`, 5, 3600);
  const data = await exportAccountData(user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="keylingo-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
