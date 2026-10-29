"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Alert, Button, Card, cn } from "./ui";

const GOALS = [
  ["travel", "✈️", "Viajar", "Situações do dia a dia: hotel, restaurante, direções"],
  ["work", "💼", "Trabalho", "Reuniões, e-mails e conversas profissionais"],
  ["study", "🎓", "Estudos", "Provas, intercâmbio e leitura"],
  ["culture", "🎬", "Cultura e lazer", "Filmes, músicas, séries e amigos"],
  ["other", "✨", "Outro motivo", "Só quero aprender"],
] as const;

/** Meta diária em XP. Uma lição nova vale 25 XP; uma sessão rápida de jogo, ~20–40 XP. */
const DAILY = [
  [10, "Leve", "≈ 5 min por dia"],
  [30, "Regular", "≈ 10 min por dia"],
  [50, "Dedicado", "≈ 15–20 min por dia"],
  [100, "Intenso", "≈ 30 min por dia"],
] as const;

export function OnboardingForm({ languageName, flag, initialGoal, initialDaily }: { languageName: string; flag: string; initialGoal: string | null; initialDaily: number }) {
  const router = useRouter();
  const [goal, setGoal] = useState<string | null>(initialGoal);
  const [daily, setDaily] = useState<number>(DAILY.some(([v]) => v === initialDaily) ? initialDaily : 30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(skip = false) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/profile/onboarding", { body: skip ? { learningGoal: null, dailyGoalXp: 30 } : { learningGoal: goal, dailyGoalXp: daily } });
      router.push("/aprender");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-brand-700">
          <span aria-hidden="true">{flag}</span> {languageName}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">Vamos montar seu plano de estudo</h1>
        <p className="mt-1 text-slate-600">Duas perguntas rápidas. Você pode mudar isso depois no perfil.</p>
      </div>

      <Card>
        <fieldset>
          <legend className="font-bold text-slate-900">1. Por que você quer aprender?</legend>
          <div role="radiogroup" className="mt-3 grid gap-2 sm:grid-cols-2">
            {GOALS.map(([value, icon, label, desc]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={goal === value}
                onClick={() => setGoal(value)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                  goal === value ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-slate-200 hover:border-brand-300",
                )}
              >
                <span className="text-2xl" aria-hidden="true">{icon}</span>
                <span>
                  <span className="block font-semibold text-slate-900">{label}</span>
                  <span className="block text-xs text-slate-600">{desc}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card>
        <fieldset>
          <legend className="font-bold text-slate-900">2. Qual será sua meta diária?</legend>
          <p className="text-sm text-slate-600">Pouco todo dia funciona melhor que muito de vez em quando.</p>
          <div role="radiogroup" className="mt-3 grid gap-2 sm:grid-cols-4">
            {DAILY.map(([xp, label, desc]) => (
              <button
                key={xp}
                type="button"
                role="radio"
                aria-checked={daily === xp}
                aria-label={`${label}: ${xp} XP por dia, ${desc}`}
                onClick={() => setDaily(xp)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  daily === xp ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-slate-200 hover:border-brand-300",
                )}
              >
                <span className="block font-semibold text-slate-900">{label}</span>
                <span className="block text-sm text-slate-700">{xp} XP/dia</span>
                <span className="block text-xs text-slate-500">{desc}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={busy || !goal} onClick={() => save()}>
          Começar a primeira lição
        </Button>
        <Button size="lg" variant="ghost" disabled={busy} onClick={() => save(true)}>
          Pular por enquanto
        </Button>
      </div>
    </div>
  );
}
