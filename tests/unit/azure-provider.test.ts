import { afterEach, describe, expect, it, vi } from "vitest";
import { createAzureProvider } from "@/lib/server/speech/azure";

// Valida o contrato da integração (formato de requisição e parsing da resposta documentada).
// NÃO substitui um teste com a API real, que exige AZURE_SPEECH_KEY.
afterEach(() => vi.unstubAllGlobals());

describe("Azure AI Speech (fetch simulado)", () => {
  it("TTS envia SSML com a voz do idioma e escapa o texto", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const p = createAzureProvider("KEY", "brazilsouth");
    const r = await p.synthesize("Tom & Jerry <3", "fr-FR", { rate: 0.8 });
    expect(r.audio.length).toBe(3);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://brazilsouth.tts.speech.microsoft.com/cognitiveservices/v1");
    expect((init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe("KEY");
    expect(init.body).toContain('name="fr-FR-DeniseNeural"');
    expect(init.body).toContain("Tom &amp; Jerry &lt;3");
    expect(init.body).toContain('rate="-20%"');
  });

  it("avaliação de pronúncia envia o texto de referência e interpreta a resposta", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            RecognitionStatus: "Success",
            NBest: [
              {
                Display: "Good morning.",
                PronunciationAssessment: { PronScore: 88.4, AccuracyScore: 90, FluencyScore: 85, CompletenessScore: 100 },
                Words: [
                  { Word: "good", PronunciationAssessment: { AccuracyScore: 95, ErrorType: "None" } },
                  { Word: "morning", PronunciationAssessment: { AccuracyScore: 40, ErrorType: "Mispronunciation" } },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = createAzureProvider("KEY", "eastus");
    const r = await p.assessPronunciation(Buffer.from("wav"), "audio/wav", "Good morning", "en-US");
    expect(r.pronunciationScore).toBe(88.4);
    expect(r.words[1]).toMatchObject({ word: "morning", errorType: "Mispronunciation" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("eastus.stt.speech.microsoft.com");
    expect(url).toContain("language=en-US");
    const header = JSON.parse(Buffer.from((init.headers as Record<string, string>)["Pronunciation-Assessment"], "base64").toString());
    expect(header).toMatchObject({ ReferenceText: "Good morning", GradingSystem: "HundredMark", EnableMiscue: true });
  });

  it("nada reconhecido = nota 0; erro HTTP vira erro tratável", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ RecognitionStatus: "NoMatch" }), { status: 200 })));
    const p = createAzureProvider("KEY", "eastus");
    expect((await p.assessPronunciation(Buffer.from("x"), "audio/wav", "Hi", "en-US")).pronunciationScore).toBe(0);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(p.synthesize("hi", "en-US")).rejects.toMatchObject({ retryable: true });
  });
});
