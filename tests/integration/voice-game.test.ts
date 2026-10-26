import { describe, expect, it } from "vitest";
import { queryOne } from "../../src/lib/server/db";
import { finishSession } from "../../src/lib/server/game/finish";
import { createSession, serveItem, submitVoiceAttempt } from "../../src/lib/server/game/sessions";
import { resetSpeechProviderForTests } from "../../src/lib/server/speech";
import { itemText, makeUser, sessionSize } from "./helpers";

const audioOf = (text: string) => ({ data: Buffer.from(text, "utf8"), contentType: "audio/wav" });

describe("Jogo com Vozes", () => {
  it("exige consentimento para o microfone", async () => {
    const u = await makeUser();
    await expect(createSession(u, { language: "en", mode: "voice", preset: "voice_quick", ranked: true })).rejects.toMatchObject({ status: 403 });
  });

  it("avaliação no servidor (provedor simulado): tentativas, melhor nota e ranking", async () => {
    const u = await makeUser({ consent: true });
    const { id, kind } = await createSession(u, { language: "en", mode: "voice", preset: "voice_quick", ranked: true });
    expect(kind).toBe("ranked");
    const n = await sessionSize(id);
    for (let idx = 0; idx < n; idx++) {
      const { prompt } = await serveItem(u.id, id, idx);
      expect(prompt.format).toBe("speak");
      expect(prompt.audio?.type).toBe("server");
      const text = await itemText(id, idx);
      if (idx === 0) {
        const bad = (await submitVoiceAttempt(u.id, id, { idx, attempt: 1, audio: audioOf("banana") })) as { score: number; canRetry: boolean };
        expect(bad.score).toBeLessThan(60);
        expect(bad.canRetry).toBe(true);
        const good = (await submitVoiceAttempt(u.id, id, { idx, attempt: 2, audio: audioOf(text) })) as {
          score: number;
          attemptScore: number;
          bestScore: number;
          approximate: boolean;
        };
        expect(good.score).toBe(100);
        expect(good.attemptScore).toBe(90); // 2ª tentativa vale 90%
        expect(good.bestScore).toBe(90);
        expect(good.approximate).toBe(false);
      } else {
        await submitVoiceAttempt(u.id, id, { idx, attempt: 1, audio: audioOf(text) });
      }
    }
    // Reenvio idempotente
    const replay = await submitVoiceAttempt(u.id, id, { idx: 0, attempt: 2, audio: audioOf("outra coisa") });
    expect(replay).toMatchObject({ replayed: true, score: 100 });
    // Sem áudio, a avaliação do servidor recusa
    const r = await finishSession(u.id, id);
    expect(r.mode).toBe("voice");
    expect(r.rankEligible).toBe(true);
    expect(r.rankPoints).toBeGreaterThan(0);
    expect(r.achievements.map((a) => a.code)).toContain("first_voice");
    // O áudio não é armazenado: só o texto reconhecido
    const ans = await queryOne<{ answer_text: string }>(`select answer_text from answers where session_id = $1 and idx = 1`, [id]);
    expect(ans!.answer_text).toBeTruthy();
  });

  it("sem provedor no servidor: competitivo bloqueado, treino com avaliação aproximada", async () => {
    const prev = process.env.SPEECH_PROVIDER;
    process.env.SPEECH_PROVIDER = "none";
    resetSpeechProviderForTests();
    try {
      const u = await makeUser({ consent: true });
      await expect(createSession(u, { language: "fr", mode: "voice", preset: "voice_quick", ranked: true })).rejects.toMatchObject({
        code: "voice_ranked_unavailable",
      });
      const { id, kind } = await createSession(u, { language: "fr", mode: "voice", preset: "voice_practice", ranked: false });
      expect(kind).toBe("practice");
      const { prompt } = await serveItem(u.id, id, 0);
      expect(prompt.audio?.type).toBe("browser");
      await expect(submitVoiceAttempt(u.id, id, { idx: 0, attempt: 1 })).rejects.toMatchObject({ code: "transcript_required" });
      const text = await itemText(id, 0);
      const res = (await submitVoiceAttempt(u.id, id, { idx: 0, attempt: 1, transcripts: [text.toLowerCase()] })) as {
        approximate: boolean;
        score: number;
      };
      expect(res.approximate).toBe(true);
      expect(res.score).toBe(100);
      const r = await finishSession(u.id, id, "quit");
      expect(r.rankPoints).toBe(0);
    } finally {
      process.env.SPEECH_PROVIDER = prev;
      resetSpeechProviderForTests();
    }
  });
});
