import { HttpError } from "./errors";

export const JSON_BODY_LIMIT = 64 * 1024; // 64 KiB: suficiente para qualquer formulário da aplicação
export const AUDIO_BODY_LIMIT = 2 * 1024 * 1024 + 16 * 1024; // ~60 s de WAV 16 kHz mono + campos do formulário

export const payloadTooLarge = () => new HttpError(413, "payload_too_large", "Requisição grande demais.");

/**
 * Lê o corpo da requisição em streaming, interrompendo assim que o limite é ultrapassado
 * (não confia apenas em Content-Length, que pode estar ausente ou mentir).
 */
export async function readBodyLimited(req: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(req.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > limit) throw payloadTooLarge();
  if (!req.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw payloadTooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(total));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** Confere a assinatura real de um arquivo WAV ("RIFF"…"WAVE"), sem confiar no tipo declarado pelo cliente. */
export function looksLikeWav(data: Uint8Array): boolean {
  if (data.length < 12) return false;
  const ascii = (from: number) => String.fromCharCode(...data.subarray(from, from + 4));
  return ascii(0) === "RIFF" && ascii(8) === "WAVE";
}
