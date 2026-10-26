import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { badRequest } from "@/lib/server/errors";
import { submitVoiceAttempt, voiceTranscriptSchema } from "@/lib/server/game/sessions";
import { json, parseJson, route } from "@/lib/server/http";

const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // ~60 s de WAV 16 kHz mono

/**
 * Tentativa de fala.
 *  - multipart/form-data (idx, attempt, audio): avaliação no servidor. O áudio é processado em memória
 *    e descartado; nada é gravado em disco ou banco.
 *  - application/json (idx, attempt, transcripts): reconhecimento feito pelo navegador (aproximado).
 */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const type = req.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_AUDIO_BYTES + 10_000) throw badRequest("audio_too_large", "Gravação longa demais (máx. ~60 s).");
    const form = await req.formData();
    const meta = z
      .object({ idx: z.coerce.number().int().min(0).max(500), attempt: z.coerce.number().int().min(1).max(3) })
      .parse({ idx: form.get("idx"), attempt: form.get("attempt") });
    const file = form.get("audio");
    if (!(file instanceof Blob) || file.size === 0) throw badRequest("audio_required", "Nenhum áudio recebido.");
    if (file.size > MAX_AUDIO_BYTES) throw badRequest("audio_too_large", "Gravação longa demais (máx. ~60 s).");
    if (!/^audio\/wav/.test(file.type)) throw badRequest("audio_format", "Formato de áudio não suportado (use WAV PCM 16 kHz).");
    const data = Buffer.from(await file.arrayBuffer());
    return json(await submitVoiceAttempt(user.id, id, { ...meta, audio: { data, contentType: "audio/wav; codecs=audio/pcm; samplerate=16000" } }));
  }
  const input = await parseJson(req, voiceTranscriptSchema);
  return json(await submitVoiceAttempt(user.id, id, input));
});
