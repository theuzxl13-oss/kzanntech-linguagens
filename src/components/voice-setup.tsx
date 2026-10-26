"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, ApiError } from "@/lib/client/api";
import { browserSupport, micErrorMessage, startWavRecording } from "@/lib/client/speech";
import { PRESETS } from "@/lib/domain/presets";
import { MicHelp } from "./mic-help";
import { Alert, Button, Card, ProgressBar, cn } from "./ui";

const noopSubscribe = () => () => {};

interface Props {
  language: string;
  languageName: string;
  consent: boolean;
  server: { available: boolean; label?: string; privacyNote?: string };
  clientRankedAllowed: boolean;
}

export function VoiceSetup({ language, languageName, consent: initialConsent, server, clientRankedAllowed }: Props) {
  const router = useRouter();
  const [consent, setConsent] = useState(initialConsent);
  const support = useSyncExternalStore(noopSubscribe, browserSupport, () => null);
  const [preset, setPreset] = useState("voice_quick");
  const [ranked, setRanked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micState, setMicState] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [micMsg, setMicMsg] = useState("");
  const [level, setLevel] = useState(0);
  const stopRef = useRef<null | (() => Promise<Blob>)>(null);

  useEffect(() => {
    return () => {
      stopRef.current?.();
    };
  }, []);

  const engine = server.available ? "server" : support?.recognition ? "client" : "none";
  const canRank = engine === "server" || (engine === "client" && clientRankedAllowed);
  const presets = PRESETS.filter((p) => p.mode === "voice");
  const p = presets.find((x) => x.id === preset)!;

  async function giveConsent(value: boolean) {
    setBusy(true);
    try {
      await api("/api/profile/voice-consent", { body: { consent: value } });
      setConsent(value);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function testMic() {
    setMicState("testing");
    setMicMsg("");
    try {
      const rec = await startWavRecording(setLevel, 4);
      stopRef.current = rec.stop;
      await new Promise((r) => setTimeout(r, 3000));
      await rec.stop();
      stopRef.current = null;
      setLevel(0);
      setMicState("ok");
    } catch (e) {
      setMicState("error");
      setMicMsg(micErrorMessage((e as Error).name));
    }
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const s = await api<{ id: string }>("/api/sessions", { body: { language, mode: "voice", preset, ranked: ranked && canRank && p.rankedAllowed } });
      router.push(`/sessao/${s.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível iniciar.");
      setBusy(false);
    }
  }

  if (!consent) {
    return (
      <Card className="max-w-2xl p-6 sm:p-8">
        <h2 className="text-xl font-bold">🎙️ Antes de começar: uso do microfone</h2>
        <div className="mt-3 space-y-3 text-slate-700">
          <p>No Jogo com Vozes você fala frases em voz alta para receber feedback. Para isso:</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>O navegador vai pedir permissão para usar o microfone. Ele só é ativado quando você aperta &ldquo;Falar&rdquo;.</li>
            <li>
              <strong>O KeyLingo não grava nem armazena o seu áudio.</strong> Guardamos apenas o texto reconhecido e a nota, no seu histórico.
            </li>
            <li>
              {server.available
                ? server.privacyNote
                : "O reconhecimento será feito pelo próprio navegador; o fabricante dele (ex.: Google no Chrome, Apple no Safari) pode processar o áudio conforme a política própria."}
            </li>
            <li>Você pode revogar este consentimento a qualquer momento em Perfil → Privacidade.</li>
          </ul>
          <p className="text-sm">
            Detalhes na{" "}
            <Link href="/privacidade" className="font-semibold text-brand-700 underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </div>
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => giveConsent(true)} disabled={busy}>
            Concordo e quero continuar
          </Button>
          <Link href="/jogar/digitar" className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Agora não — ir para o Jogo de Digitar
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {support &&
        (engine === "server" ? (
          <Alert tone="success" title="Avaliação de pronúncia no servidor">
            Sua fala é comparada acusticamente com a referência por {server.label}. A nota considera precisão, fluência e completude.
          </Alert>
        ) : engine === "client" ? (
          <Alert tone="warning" title="Avaliação aproximada">
            O serviço de avaliação de pronúncia não está configurado neste servidor. Usaremos o reconhecimento de fala do seu navegador: a nota indica quais
            palavras foram reconhecidas — não é uma medida fonética da pronúncia.
            {!clientRankedAllowed && " Por não poder ser verificada pelo servidor, esta avaliação vale apenas para treino (sem ranking)."}
          </Alert>
        ) : (
          <Alert tone="error" title="Reconhecimento de fala indisponível neste navegador">
            Este navegador não oferece reconhecimento de fala e o servidor não tem avaliação de voz configurada. Tente o Chrome, Edge ou Safari atualizados,
            ou pratique a escuta no{" "}
            <Link className="font-semibold underline" href="/jogar/digitar">
              Jogo de Digitar (formato Escuta)
            </Link>
            .
          </Alert>
        ))}

      {support && !support.microphone && engine === "server" && (
        <Alert tone="error">Este navegador não permite acesso ao microfone. Use um navegador atualizado em conexão segura (https).</Alert>
      )}

      <Card>
        <h2 className="font-bold">Teste do microfone</h2>
        <p className="mt-1 text-sm text-slate-600">Fale algo por 3 segundos para conferir se o microfone está captando sua voz.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={testMic} disabled={micState === "testing" || !support?.microphone}>
            {micState === "testing" ? "🔴 Ouvindo…" : "Testar microfone"}
          </Button>
          {micState === "testing" && <ProgressBar className="max-w-48" value={level} label="Nível do microfone" color="green" />}
          {micState === "ok" && (
            <span role="status" className="text-sm font-semibold text-emerald-700">
              ✓ Microfone funcionando
            </span>
          )}
        </div>
        {micState === "error" && (
          <Alert tone="error" className="mt-3">
            {micMsg} Veja abaixo como liberar o acesso.
          </Alert>
        )}
        <div className="mt-4">
          <MicHelp />
        </div>
      </Card>

      <section aria-labelledby="dur-voz">
        <h2 id="dur-voz" className="mb-3 text-lg font-bold">
          Sessão
        </h2>
        <div role="radiogroup" aria-labelledby="dur-voz" className="grid gap-3 sm:grid-cols-3">
          {presets.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={preset === x.id}
              onClick={() => setPreset(x.id)}
              className={cn("rounded-xl border-2 bg-white p-3.5 text-left", preset === x.id ? "border-brand-500 bg-brand-50" : "border-slate-200")}
            >
              <span className="block font-semibold">{x.label}</span>
              <span className="text-sm text-slate-600">{x.description}</span>
            </button>
          ))}
        </div>
        {p.rankedAllowed && (
          <label className={cn("mt-4 flex items-center gap-2 text-sm", !canRank && "text-slate-400")}>
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={ranked && canRank} disabled={!canRank} onChange={(e) => setRanked(e.target.checked)} />
            Sessão competitiva (vale pontos no ranking de vozes)
          </label>
        )}
      </section>

      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button size="lg" onClick={start} disabled={busy || engine === "none"}>
          {busy ? "Preparando…" : `Começar em ${languageName.toLowerCase()}`}
        </Button>
        <button type="button" className="text-sm font-semibold text-slate-500 underline" onClick={() => giveConsent(false)}>
          Revogar consentimento do microfone
        </button>
      </div>
    </div>
  );
}
