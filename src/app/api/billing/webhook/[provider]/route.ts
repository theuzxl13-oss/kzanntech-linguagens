import { NextResponse, type NextRequest } from "next/server";
import { readBodyLimited, JSON_BODY_LIMIT } from "@/lib/server/body";
import { WebhookVerificationError } from "@/lib/server/billing";
import { handleWebhook, logWebhookFailure } from "@/lib/server/billing/service";
import { HttpError } from "@/lib/server/errors";

/**
 * Webhook do provedor de pagamento. Não usa o wrapper route(): chamadas servidor→servidor não têm
 * cabeçalho Origin; a autenticidade vem da assinatura HMAC do corpo bruto (verificada antes de tocar no banco).
 * Respostas: 200 processado/duplicado; 400 assinatura/formato inválido (o provedor não deve repetir);
 * 500 falha temporária (o provedor repete; o reprocessamento é idempotente).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  let raw: string;
  try {
    raw = new TextDecoder().decode(await readBodyLimited(req, JSON_BODY_LIMIT));
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 400;
    return NextResponse.json({ error: "invalid_body" }, { status });
  }
  try {
    const result = await handleWebhook(provider, raw, (n) => req.headers.get(n));
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      await logWebhookFailure(provider, err).catch(() => {});
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
    await logWebhookFailure(provider, err).catch(() => {});
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
