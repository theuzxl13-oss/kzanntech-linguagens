import { z } from "zod";
import { getItem, itemSchema, updateItem } from "@/lib/server/admin";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { notFound } from "@/lib/server/errors";
import { json, parseJson, route } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };
const idOf = async (ctx: Ctx) => z.coerce.number().int().positive().parse((await ctx.params).id);

export const GET = route(async (_req, ctx: Ctx) => {
  await apiAdmin();
  const item = await getItem(await idOf(ctx));
  if (!item) throw notFound("Item não encontrado.");
  return json(item);
});

export const PUT = route(async (req, ctx: Ctx) => {
  const admin = await apiAdmin();
  await updateItem(await idOf(ctx), await parseJson(req, itemSchema), admin.id, await requestMeta());
  return json({ ok: true });
});
