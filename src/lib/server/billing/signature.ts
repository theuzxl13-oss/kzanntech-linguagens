import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookVerificationError } from "./types";

/**
 * Assinatura de webhook no formato "t=<unix>,v1=<hex>" com HMAC-SHA256 de "<t>.<corpo bruto>".
 * A janela de tolerância impede reenvio (replay) de eventos antigos capturados.
 */
export const SIGNATURE_HEADER = "x-keylingo-signature";
export const TOLERANCE_SECONDS = 300;

export function signPayload(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

export function verifySignature(body: string, header: string | null, secret: string, now = Math.floor(Date.now() / 1000)): void {
  if (!header) throw new WebhookVerificationError("Assinatura ausente.");
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) throw new WebhookVerificationError("Assinatura malformada.");
  if (Math.abs(now - t) > TOLERANCE_SECONDS) throw new WebhookVerificationError("Assinatura fora da janela de tempo.");
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"), "hex");
  const got = Buffer.from(parts.v1, "hex");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) throw new WebhookVerificationError("Assinatura inválida.");
}
