export interface SynthesisResult {
  audio: Buffer;
  contentType: string;
}

export interface AssessedWord {
  word: string;
  accuracy: number; // 0..100
  errorType: "None" | "Omission" | "Insertion" | "Mispronunciation" | string;
}

/** Resultado de avaliação de pronúncia real (comparação acústica com a referência). */
export interface PronunciationAssessment {
  recognizedText: string;
  pronunciationScore: number; // 0..100 (nota geral)
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  words: AssessedWord[];
}

export interface SpeechProvider {
  id: string;
  label: string;
  /** Política de dados do provedor, exibida ao usuário no consentimento. */
  privacyNote: string;
  synthesize(text: string, locale: string, opts?: { rate?: number }): Promise<SynthesisResult>;
  assessPronunciation(audio: Buffer, contentType: string, referenceText: string, locale: string): Promise<PronunciationAssessment>;
}

export class SpeechProviderError extends Error {
  constructor(
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
