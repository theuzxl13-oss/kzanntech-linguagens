"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { PRESETS, FORMAT_LABELS } from "@/lib/domain/presets";
import { Alert, Button, Card, ProgressBar, cn } from "./ui";

export interface UnitInfo {
  id: number;
  title: string;
  level_code: string;
  icon: string;
  total: number;
  learned: number;
  due: number;
}

function Choice({ checked, onClick, title, desc, disabled }: { checked: boolean; onClick: () => void; title: string; desc?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-xl border-2 bg-white p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300",
      )}
    >
      <span className="block font-semibold text-slate-900">{title}</span>
      {desc && <span className="mt-0.5 block text-sm text-slate-600">{desc}</span>}
    </button>
  );
}

async function start(router: ReturnType<typeof useRouter>, body: Record<string, unknown>, setError: (s: string | null) => void, setBusy: (b: boolean) => void) {
  setBusy(true);
  setError(null);
  try {
    const s = await api<{ id: string }>("/api/sessions", { body });
    router.push(`/sessao/${s.id}`);
  } catch (e) {
    setError(e instanceof ApiError ? e.message : "Não foi possível iniciar a sessão.");
    setBusy(false);
  }
}

export function TypingSetup({
  language,
  units,
  serverAudio,
  initialFocus,
  initialUnit,
  beginner = false,
}: {
  language: string;
  units: UnitInfo[];
  serverAudio: boolean;
  initialFocus: boolean;
  initialUnit: number | null;
  /** Aluno ainda sem lições concluídas: sugere começar pela trilha. */
  beginner?: boolean;
}) {
  const router = useRouter();
  const [format, setFormat] = useState<"mixed" | "translate" | "write" | "listen">("mixed");
  const [preset, setPreset] = useState("quick");
  const [ranked, setRanked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presets = PRESETS.filter((p) => p.mode === "typing" && p.id !== "placement");
  const p = presets.find((x) => x.id === preset)!;
  const listenRankedBlocked = format === "listen" && !serverAudio;
  const canRank = p.rankedAllowed && !listenRankedBlocked;

  const focusedUnit = initialUnit ? units.find((u) => u.id === initialUnit) : null;
  const totalDue = units.reduce((s, u) => s + u.due, 0);

  return (
    <div className="space-y-8">
      {beginner && !initialFocus && !focusedUnit && (
        <Alert tone="info" title="Começando agora?">
          Os jogos testam o que você já sabe. Se é a sua primeira vez com o idioma, faça antes as lições da{" "}
          <Link href="/aprender" className="font-semibold underline">
            trilha de aprendizado
          </Link>
          : elas apresentam cada palavra com tradução, áudio e explicação.
        </Alert>
      )}
      {(initialFocus || focusedUnit) && (
        <Card className="border-brand-200 bg-brand-50">
          <p className="font-semibold">{initialFocus ? `Revisão: ${totalDue} itens no momento ideal de revisar` : `Foco: ${focusedUnit!.icon} ${focusedUnit!.title}`}</p>
          <p className="text-sm text-slate-600">Sessão de prática focada (não conta para o ranking).</p>
          {error && <Alert tone="error" className="mt-3">{error}</Alert>}
          <Button
            className="mt-3"
            disabled={busy}
            onClick={() =>
              start(router, { language, mode: "typing", preset: "practice", format: "mixed", ranked: false, ...(initialFocus ? { focus: "review" } : { unitId: initialUnit }) }, setError, setBusy)
            }
          >
            {busy ? "Preparando…" : "Começar agora"}
          </Button>
        </Card>
      )}

      <section aria-labelledby="formato">
        <h2 id="formato" className="mb-3 text-lg font-bold">
          Formato
        </h2>
        <div role="radiogroup" aria-labelledby="formato" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Choice checked={format === "mixed"} onClick={() => setFormat("mixed")} title="🎲 Misto" desc="Os três formatos alternados." />
          <Choice checked={format === "translate"} onClick={() => setFormat("translate")} title={`🔁 ${FORMAT_LABELS.translate}`} desc="Veja no idioma, digite em português." />
          <Choice checked={format === "write"} onClick={() => setFormat("write")} title={`✍️ ${FORMAT_LABELS.write}`} desc="Veja em português, escreva no idioma." />
          <Choice checked={format === "listen"} onClick={() => setFormat("listen")} title={`🎧 ${FORMAT_LABELS.listen}`} desc="Ouça o áudio e digite o que ouviu." />
        </div>
      </section>

      <section aria-labelledby="duracao">
        <h2 id="duracao" className="mb-3 text-lg font-bold">
          Duração
        </h2>
        <div role="radiogroup" aria-labelledby="duracao" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {presets.map((x) => (
            <Choice key={x.id} checked={preset === x.id} onClick={() => setPreset(x.id)} title={x.label} desc={x.description} />
          ))}
        </div>
      </section>

      <section aria-labelledby="modo" className="space-y-3">
        <h2 id="modo" className="text-lg font-bold">
          Tipo de sessão
        </h2>
        <div role="radiogroup" aria-labelledby="modo" className="grid gap-3 sm:grid-cols-2">
          <Choice
            checked={ranked && canRank}
            disabled={!canRank}
            onClick={() => setRanked(true)}
            title="🏆 Competitiva"
            desc="Vale pontos de ranking. Respostas e tempo são validados no servidor."
          />
          <Choice checked={!ranked || !canRank} onClick={() => setRanked(false)} title="🌱 Treino" desc="Sem pressão: XP e revisão, sem ranking." />
        </div>
        {listenRankedBlocked && (
          <Alert tone="info">
            A escuta competitiva exige áudio gerado pelo servidor, que não está configurado aqui. Use o treino: o áudio será reproduzido pela voz do seu
            navegador.
          </Alert>
        )}
      </section>

      {error && !initialFocus && !focusedUnit && <Alert tone="error">{error}</Alert>}
      <Button size="lg" className="w-full sm:w-auto" disabled={busy} onClick={() => start(router, { language, mode: "typing", preset, format, ranked: ranked && canRank }, setError, setBusy)}>
        {busy ? "Preparando…" : "Começar sessão"}
      </Button>

      <section aria-labelledby="atividades">
        <h2 id="atividades" className="mb-1 text-lg font-bold">
          Atividades por tema
        </h2>
        <p className="mb-3 text-sm text-slate-600">Pratique um tema específico (modo treino).</p>
        {/* grid-cols-1 (minmax(0, 1fr)): sem ele, títulos longos alargam a coluna além da tela no celular */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((u) => (
            <Card key={u.id} className="flex items-center gap-3 p-4">
              <span className="text-2xl" aria-hidden="true">
                {u.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{u.title}</p>
                <ProgressBar className="mt-1.5" value={u.learned} max={u.total} label={`Progresso em ${u.title}`} />
                <p className="mt-0.5 text-xs text-slate-500">
                  {u.learned}/{u.total} aprendidos{u.due ? ` · ${u.due} para revisar` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                aria-label={`Praticar ${u.title}`}
                onClick={() => start(router, { language, mode: "typing", preset: "practice", format, ranked: false, unitId: u.id }, setError, setBusy)}
              >
                Praticar
              </Button>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
