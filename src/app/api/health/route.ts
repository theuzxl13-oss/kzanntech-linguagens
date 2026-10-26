import { query } from "@/lib/server/db";
import { json } from "@/lib/server/http";

export async function GET() {
  try {
    await query("select 1");
    return json({ ok: true, db: "ok" });
  } catch {
    return json({ ok: false, db: "error" }, 503);
  }
}
