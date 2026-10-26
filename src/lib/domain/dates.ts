/** Utilitários de data sensíveis a fuso horário (sem dependências externas). */

/** Data local (AAAA-MM-DD) de um instante no fuso informado. */
export function localDate(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Início da semana ISO (segunda-feira 00:00 UTC) que contém `at`. */
export function startOfIsoWeekUtc(at: Date): Date {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

export function isoWeekKey(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function startOfMonthUtc(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

export function startOfNextMonthUtc(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}

const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function monthNamePt(at: Date): string {
  return `${MONTHS_PT[at.getUTCMonth()]} de ${at.getUTCFullYear()}`;
}
