import { config } from "../config";
import { createAzureProvider } from "./azure";
import { createMockProvider } from "./mock";
import type { SpeechProvider } from "./types";

export * from "./types";

let provider: SpeechProvider | null | undefined;

/** Provedor de voz do servidor, ou null quando nenhum está configurado. */
export function getSpeechProvider(): SpeechProvider | null {
  if (provider !== undefined) return provider;
  switch (config.speechProvider) {
    case "azure":
      provider = createAzureProvider(process.env.AZURE_SPEECH_KEY!, process.env.AZURE_SPEECH_REGION!);
      break;
    case "mock":
      provider = createMockProvider();
      break;
    default:
      provider = null;
  }
  return provider;
}

export function resetSpeechProviderForTests() {
  provider = undefined;
}

export function speechStatus() {
  const p = getSpeechProvider();
  return {
    server: p ? { available: true, id: p.id, label: p.label, assessment: true, tts: true, privacyNote: p.privacyNote } : { available: false },
    clientRankedAllowed: config.voiceAllowClientRanked,
  };
}
