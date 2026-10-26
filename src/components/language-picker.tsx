"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Alert, Button, Card, cn } from "./ui";

interface Lang {
  code: string;
  name_pt: string;
  native_name: string;
  flag: string;
  item_count: number;
  userLevel: string | null;
}
interface Level {
  code: string;
  name_pt: string;
  description: string;
}

export function LanguagePicker({ languages, levels, current }: { languages: Lang[]; levels: Level[]; current: string | null }) {
  const router = useRouter();
  const [lang, setLang] = useState<string | null>(current);
  const selected = languages.find((l) => l.code === lang) ?? null;
  const [level, setLevel] = useState<string>(selected?.userLevel ?? "A1");
  const [busy, setBusy] = useState<null | "save" | "placement">(null);
  const [error, setError] = useState<string | null>(null);

  function pick(code: string) {
    setLang(code);
    setLevel(languages.find((l) => l.code === code)?.userLevel ?? "A1");
    setError(null);
  }

  async function save() {
    if (!lang) return;
    setBusy("save");
    setError(null);
    try {
      await api("/api/languages/select", { body: { language: lang, level } });
      router.push("/jogar");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível salvar.");
      setBusy(null);
    }
  }

  async function placement() {
    if (!lang) return;
    setBusy("placement");
    setError(null);
    try {
      await api("/api/languages/select", { body: { language: lang } });
      const s = await api<{ id: string }>("/api/sessions", { body: { language: lang, mode: "typing", preset: "placement" } });
      router.push(`/sessao/${s.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível iniciar o teste.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="escolha-idioma">
        <h2 id="escolha-idioma" className="mb-3 text-lg font-bold">
          1. Qual idioma você quer aprender?
        </h2>
        <div role="radiogroup" aria-labelledby="escolha-idioma" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {languages.map((l) => (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={lang === l.code}
              onClick={() => pick(l.code)}
              className={cn(
                "rounded-2xl border-2 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                lang === l.code ? "border-brand-500 ring-4 ring-brand-100" : "border-slate-200",
              )}
            >
              <span className="text-4xl" aria-hidden="true">
                {l.flag}
              </span>
              <span className="mt-2 block font-bold text-slate-900">{l.name_pt}</span>
              <span className="block text-sm text-slate-500" lang={l.code}>
                {l.native_name}
              </span>
              <span className="mt-2 block text-xs text-slate-500">
                {l.item_count} exercícios{l.userLevel ? ` · seu nível: ${l.userLevel}` : ""}
              </span>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <section aria-labelledby="escolha-nivel" className="animate-fade-in">
          <h2 id="escolha-nivel" className="mb-1 text-lg font-bold">
            2. Qual é o seu nível em {selected.name_pt.toLowerCase()}?
          </h2>
          <p className="mb-3 text-sm text-slate-600">Níveis baseados no Quadro Europeu Comum de Referência (CEFR). Você pode mudar depois.</p>
          <div role="radiogroup" aria-labelledby="escolha-nivel" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {levels.slice(0, 4).map((lv) => (
              <button
                key={lv.code}
                type="button"
                role="radio"
                aria-checked={level === lv.code}
                onClick={() => setLevel(lv.code)}
                className={cn(
                  "rounded-xl border-2 bg-white p-4 text-left transition-colors",
                  level === lv.code ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300",
                )}
              >
                <span className="font-extrabold text-brand-700">{lv.code}</span> <span className="font-semibold">{lv.name_pt}</span>
                <span className="mt-1 block text-sm text-slate-600">{lv.description}</span>
              </button>
            ))}
          </div>
          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={save} disabled={!!busy}>
              {busy === "save" ? "Salvando…" : `Continuar com ${level}`}
            </Button>
            <Button size="lg" variant="secondary" onClick={placement} disabled={!!busy}>
              {busy === "placement" ? "Preparando teste…" : "Não sei — fazer teste de nivelamento (12 questões)"}
            </Button>
          </div>
        </section>
      )}

      {!selected && (
        <Card className="text-center text-slate-600">Selecione um idioma acima para continuar.</Card>
      )}
    </div>
  );
}
