/**
 * Azure AI Speech (REST).
 *  - TTS: https://{region}.tts.speech.microsoft.com/cognitiveservices/v1 (SSML → MP3)
 *  - STT + Avaliação de pronúncia: endpoint de "short audio" com cabeçalho Pronunciation-Assessment
 *    (áudio WAV PCM 16 kHz mono, até ~30 s).
 * A chave fica apenas no servidor. O áudio é enviado à Microsoft para processamento e NÃO é
 * armazenado pelo KeyLingo.
 */
import { SpeechProviderError, type PronunciationAssessment, type SpeechProvider } from "./types";

const VOICES: Record<string, string> = {
  "en-US": "en-US-JennyNeural",
  "en-GB": "en-GB-SoniaNeural",
  "es-ES": "es-ES-ElviraNeural",
  "es-MX": "es-MX-DaliaNeural",
  "fr-FR": "fr-FR-DeniseNeural",
  "de-DE": "de-DE-KatjaNeural",
  "it-IT": "it-IT-ElsaNeural",
  "pt-BR": "pt-BR-FranciscaNeural",
};

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function createAzureProvider(key: string, region: string): SpeechProvider {
  const timeout = (ms: number) => AbortSignal.timeout(ms);
  return {
    id: "azure",
    label: "Azure AI Speech",
    privacyNote:
      "O áudio da sua tentativa é enviado à Microsoft (Azure AI Speech) somente para reconhecimento e avaliação de pronúncia, e não é armazenado pelo KeyLingo.",
    async synthesize(text, locale, opts) {
      const voice = VOICES[locale] ?? VOICES[Object.keys(VOICES).find((l) => l.startsWith(locale.slice(0, 2))) ?? "en-US"];
      const rate = Math.round(((opts?.rate ?? 1) - 1) * 100);
      const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}"><prosody rate="${rate}%">${escapeXml(text)}</prosody></voice></speak>`;
      const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "KeyLingo",
        },
        body: ssml,
        signal: timeout(10_000),
      }).catch((e) => {
        throw new SpeechProviderError(`Falha de rede no TTS: ${(e as Error).message}`, true);
      });
      if (!res.ok) throw new SpeechProviderError(`TTS retornou HTTP ${res.status}`, res.status >= 500 || res.status === 429);
      return { audio: Buffer.from(await res.arrayBuffer()), contentType: "audio/mpeg" };
    },
    async assessPronunciation(audio, contentType, referenceText, locale) {
      const config = {
        ReferenceText: referenceText,
        GradingSystem: "HundredMark",
        Granularity: "Word",
        Dimension: "Comprehensive",
        EnableMiscue: true,
      };
      const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(locale)}&format=detailed`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": contentType,
          Accept: "application/json",
          "Pronunciation-Assessment": Buffer.from(JSON.stringify(config), "utf8").toString("base64"),
        },
        body: new Uint8Array(audio),
        signal: timeout(20_000),
      }).catch((e) => {
        throw new SpeechProviderError(`Falha de rede no reconhecimento: ${(e as Error).message}`, true);
      });
      if (!res.ok) throw new SpeechProviderError(`Reconhecimento retornou HTTP ${res.status}`, res.status >= 500 || res.status === 429);
      const data = (await res.json()) as {
        RecognitionStatus: string;
        NBest?: {
          Display: string;
          PronScore?: number;
          AccuracyScore?: number;
          FluencyScore?: number;
          CompletenessScore?: number;
          PronunciationAssessment?: { PronScore: number; AccuracyScore: number; FluencyScore: number; CompletenessScore: number };
          Words?: { Word: string; AccuracyScore?: number; ErrorType?: string; PronunciationAssessment?: { AccuracyScore: number; ErrorType: string } }[];
        }[];
      };
      if (data.RecognitionStatus !== "Success" || !data.NBest?.length) {
        return { recognizedText: "", pronunciationScore: 0, accuracyScore: 0, fluencyScore: 0, completenessScore: 0, words: [] };
      }
      const best = data.NBest[0];
      const pa = best.PronunciationAssessment;
      const result: PronunciationAssessment = {
        recognizedText: best.Display ?? "",
        pronunciationScore: pa?.PronScore ?? best.PronScore ?? 0,
        accuracyScore: pa?.AccuracyScore ?? best.AccuracyScore ?? 0,
        fluencyScore: pa?.FluencyScore ?? best.FluencyScore ?? 0,
        completenessScore: pa?.CompletenessScore ?? best.CompletenessScore ?? 0,
        words: (best.Words ?? []).map((w) => ({
          word: w.Word,
          accuracy: w.PronunciationAssessment?.AccuracyScore ?? w.AccuracyScore ?? 0,
          errorType: w.PronunciationAssessment?.ErrorType ?? w.ErrorType ?? "None",
        })),
      };
      return result;
    },
  };
}
