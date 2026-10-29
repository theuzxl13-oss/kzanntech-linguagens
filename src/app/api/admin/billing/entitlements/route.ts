import { entitlementsConfigSchema } from "@/lib/domain/entitlements";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { saveEntitlementsConfig } from "@/lib/server/entitlements";
import { audit } from "@/lib/server/events";
import { json, parseJson, route } from "@/lib/server/http";

export const PUT = route(async (req) => {
  const admin = await apiAdmin();
  const cfg = await parseJson(req, entitlementsConfigSchema);
  await saveEntitlementsConfig(cfg, admin.id);
  await audit(admin.id, "settings.entitlements_updated", { type: "settings", id: "entitlements" }, cfg, (await requestMeta()).ip);
  return json({ ok: true });
});
