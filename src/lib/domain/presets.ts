/** Configurações de sessão disponíveis para cada modalidade. */
export type Mode = "typing" | "voice";
export type SessionKind = "ranked" | "practice" | "placement";
export type TypingFormat = "translate" | "write" | "listen" | "mixed";
export type ItemFormat = "translate" | "write" | "listen" | "speak";

export interface Preset {
  id: string;
  mode: Mode;
  label: string;
  description: string;
  /** null = sem cronômetro */
  durationSeconds: number | null;
  /** Quantidade de itens que define "volume completo" para os pontos de ranking. */
  targetCount: number;
  /** Itens gerados no início da sessão (sessões cronometradas geram uma reserva). */
  poolSize: number;
  rankedAllowed: boolean;
  pausable: boolean;
}

export const PRESETS: Preset[] = [
  { id: "quick", mode: "typing", label: "Sessão rápida", description: "10 exercícios, sem cronômetro.", durationSeconds: null, targetCount: 10, poolSize: 10, rankedAllowed: true, pausable: true },
  { id: "t60", mode: "typing", label: "Desafio de 60 segundos", description: "Quantos acertos você consegue em 1 minuto?", durationSeconds: 60, targetCount: 10, poolSize: 30, rankedAllowed: true, pausable: false },
  { id: "t180", mode: "typing", label: "Desafio de 3 minutos", description: "Ritmo constante por 3 minutos.", durationSeconds: 180, targetCount: 25, poolSize: 60, rankedAllowed: true, pausable: false },
  { id: "t300", mode: "typing", label: "Desafio de 5 minutos", description: "Resistência e precisão por 5 minutos.", durationSeconds: 300, targetCount: 40, poolSize: 90, rankedAllowed: true, pausable: false },
  { id: "practice", mode: "typing", label: "Prática livre", description: "20 exercícios, sem tempo e sem ranking.", durationSeconds: null, targetCount: 20, poolSize: 20, rankedAllowed: false, pausable: true },
  { id: "voice_quick", mode: "voice", label: "Sessão rápida de voz", description: "6 frases para pronunciar.", durationSeconds: null, targetCount: 6, poolSize: 6, rankedAllowed: true, pausable: true },
  { id: "voice_standard", mode: "voice", label: "Sessão completa de voz", description: "10 frases para pronunciar.", durationSeconds: null, targetCount: 10, poolSize: 10, rankedAllowed: true, pausable: true },
  { id: "voice_practice", mode: "voice", label: "Treino livre de voz", description: "10 frases, sem ranking.", durationSeconds: null, targetCount: 10, poolSize: 10, rankedAllowed: false, pausable: true },
  { id: "placement", mode: "typing", label: "Teste de nivelamento", description: "12 traduções de níveis variados.", durationSeconds: null, targetCount: 12, poolSize: 12, rankedAllowed: false, pausable: true },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** Tempo extra após o fim do cronômetro para concluir o item em andamento (inclui áudio). */
export const ITEM_GRACE_SECONDS = 45;
/** Sessões sem cronômetro expiram após este tempo de inatividade total. */
export const UNTIMED_SESSION_MAX_SECONDS = 2 * 60 * 60;
export const MAX_ATTEMPTS = 3;

export const FORMAT_LABELS: Record<string, string> = {
  translate: "Tradução",
  write: "Escrita no idioma",
  listen: "Escuta e digitação",
  mixed: "Misto",
  speak: "Pronúncia",
};
