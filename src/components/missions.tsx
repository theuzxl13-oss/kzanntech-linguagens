"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/client/api";
import { ACCENTS } from "./player/typing-player";
import { Alert, Badge, Button, ButtonLink, Card, ProgressBar, cn } from "./ui";

function errorText(err: unknown) {
  return err instanceof ApiError ? err.message : "Não foi possível concluir. Tente novamente.";
}

export function MissionStartButton({ missionId, label, variant = "primary" }: { missionId: string; label: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ attemptId: string }>(`/api/missions/${missionId}/start`, { method: "POST" });
            router.push(`/missoes/jogar/${r.attemptId}`);
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        {busy ? "Abrindo…" : label}
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

export interface MissionSummaryView {
  score: number;
  xp: number;
  weeklyGoalXp?: number;
  firstCompletion: boolean;
  learnedPt: string;
  wellDone: string[];
  corrections: { goalPt: string; answer: string; notes: string[]; model: string }[];
  practice: { phrase: string; goalPt: string } | null;
  reviewScheduled: number;
  next: { id: string; title: string } | null;
}

export interface AttemptView {
  attemptId: string;
  status: "in_progress" | "completed" | "abandoned";
  mission: {
    id: string;
    title: string;
    level: string;
    language: string;
    characterName: string;
    characterRole: string;
    contextPt: string;
    objectivePt: string;
    structures: string[];
    totalSteps: number;
    reviewed: boolean;
  };
  transcript: {
    npc: string;
    npcPt: string;
    turns: { text: string; passed: boolean; feedback: string[] }[];
    reply: { text: string; pt: string } | null;
    model: string | null;
  }[];
  current: { step: number; goalPt: string; tryNo: number; hintLevel: number; hints: string[] } | null;
  summary: MissionSummaryView | null;
}

interface AnswerResponse {
  passed: boolean;
  feedback: string[];
  advanced: boolean;
  finished: boolean;
  triesLeft: number;
  model: string | null;
}

function NpcBubble({ name, text, pt, lang }: { name: string; text: string; pt: string; lang: string }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg">
        🙂
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-semibold text-brand-700">{name}</p>
        <p lang={lang} className="text-lg text-slate-900">
          {text}
        </p>
        <details className="mt-1 text-sm text-slate-600">
          <summary className="cursor-pointer select-none text-xs text-slate-500">Ver tradução</summary>
          {pt}
        </details>
      </div>
    </div>
  );
}

function PlayerBubble({ text, passed, feedback, lang }: { text: string; passed: boolean; feedback: string[]; lang: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <p lang={lang} className={cn("max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2 text-lg", passed ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-800")}>
        {text || <span className="italic opacity-70">(sem resposta)</span>}
      </p>
      <ul className={cn("max-w-[85%] space-y-0.5 text-right text-sm", passed ? "text-emerald-800" : "text-rose-800")}>
        <li className="sr-only">{passed ? "Resposta entendida." : "Resposta ainda não entendida."}</li>
        {feedback.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
    </div>
  );
}

export function MissionPlayer({ initial }: { initial: AttemptView }) {
  const [view, setView] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<AnswerResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const m = view.mission;
  const accents = ACCENTS[m.language] ?? [];
  const done = view.transcript.filter((_, i) => !view.current || i < view.current.step).length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [view]);

  async function refresh() {
    setView(await api<AttemptView>(`/api/missions/attempts/${view.attemptId}`));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!view.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<AnswerResponse>(`/api/missions/attempts/${view.attemptId}/answer`, {
        body: { step: view.current.step, tryNo: view.current.tryNo, text },
      });
      setLast(r);
      setText("");
      await refresh();
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiError && ["step_mismatch", "attempt_mismatch"].includes(err.code)) await refresh().catch(() => {});
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function hint() {
    if (!view.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/missions/attempts/${view.attemptId}/hint`, { body: { step: view.current.step } });
      await refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function insertChar(ch: string) {
    const el = inputRef.current;
    if (!el) return setText((t) => t + ch);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + ch + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/missoes" className="text-sm font-semibold text-brand-700 hover:underline">
            ← Missões
          </Link>
          <Badge color="brand">{m.level}</Badge>
          {!m.reviewed && <Badge>conteúdo em revisão</Badge>}
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">{m.title}</h1>
        <p className="text-sm text-slate-600">{m.contextPt}</p>
        <ProgressBar value={view.status === "completed" ? m.totalSteps : done} max={m.totalSteps} label={`Etapa ${Math.min(done + 1, m.totalSteps)} de ${m.totalSteps}`} />
      </header>

      <section aria-label={`Conversa com ${m.characterName}`} className="space-y-4 rounded-3xl bg-slate-50 p-4">
        <div role="log" aria-live="polite" aria-relevant="additions" className="space-y-4">
          {view.transcript.map((t, i) => (
            <div key={i} className="space-y-3">
              <NpcBubble name={`${m.characterName} · ${m.characterRole}`} text={t.npc} pt={t.npcPt} lang={m.language} />
              {t.turns.map((turn, j) => (
                <PlayerBubble key={j} text={turn.text} passed={turn.passed} feedback={turn.feedback} lang={m.language} />
              ))}
              {t.model && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
                  Uma forma de dizer: <strong lang={m.language}>{t.model}</strong>
                </p>
              )}
              {t.reply && i === view.transcript.length - 1 && view.status === "completed" && (
                <NpcBubble name={m.characterName} text={t.reply.text} pt={t.reply.pt} lang={m.language} />
              )}
            </div>
          ))}
        </div>
        <div ref={endRef} />
      </section>

      {view.current && (
        <Card className="space-y-3">
          <p className="font-semibold text-slate-900">
            <span aria-hidden="true">🎯 </span>
            {view.current.goalPt}
          </p>
          {view.current.hints.length > 0 && (
            <ol className="space-y-1 rounded-xl bg-sky-50 p-3 text-sm text-sky-950" aria-label="Dicas">
              {view.current.hints.map((h, i) => (
                <li key={i}>
                  💡 {i === 2 ? "Resposta-modelo: " : ""}
                  <span lang={i === 0 ? "pt-BR" : m.language}>{h}</span>
                </li>
              ))}
            </ol>
          )}
          {last && !last.passed && !last.advanced && (
            <p role="status" className="text-sm text-rose-800">
              Tentativas restantes nesta etapa: {last.triesLeft}
            </p>
          )}
          <form onSubmit={submit} className="space-y-2">
            <label htmlFor="missao-resposta" className="text-sm font-medium text-slate-700">
              Sua resposta (em {m.language.toUpperCase()})
            </label>
            <input
              id="missao-resposta"
              ref={inputRef}
              lang={m.language}
              autoComplete="off"
              autoCapitalize="sentences"
              spellCheck={false}
              maxLength={300}
              readOnly={busy}
              aria-busy={busy}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              autoFocus
            />
            {accents.length > 0 && (
              <div className="flex flex-wrap gap-1" aria-label="Teclas de acentos">
                {accents.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertChar(ch)}
                    className="h-9 min-w-9 rounded-lg border border-slate-300 bg-white px-2 font-semibold text-slate-700 hover:bg-slate-50"
                    aria-label={`Inserir ${ch}`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !text.trim()}>
                {busy ? "Enviando…" : "Responder"}
              </Button>
              <Button type="button" variant="secondary" disabled={busy || view.current.hintLevel >= 3} onClick={hint}>
                Dica ({view.current.hintLevel}/3)
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Não existe uma única resposta certa: o que importa é transmitir a ideia. Dicas e novas tentativas reduzem um pouco a pontuação da etapa.
            </p>
          </form>
        </Card>
      )}

      {view.status === "completed" && view.summary && <MissionSummaryCard summary={view.summary} lang={m.language} />}
    </div>
  );
}

function MissionSummaryCard({ summary: s, lang }: { summary: MissionSummaryView; lang: string }) {
  return (
    <Card className="space-y-4" aria-labelledby="resumo-missao">
      <div>
        <h2 id="resumo-missao" className="text-xl font-extrabold text-slate-900">
          Missão concluída!
        </h2>
        <p className="text-slate-700">{s.learnedPt}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge color="green">Desempenho na missão: {Math.round(s.score * 100)}%</Badge>
        <Badge color="brand">+{s.xp} XP</Badge>
        {!!s.weeklyGoalXp && <Badge color="green">🎯 meta semanal: +{s.weeklyGoalXp} XP</Badge>}
        {!s.firstCompletion && <Badge>repetição: XP reduzido</Badge>}
      </div>
      {s.wellDone.length > 0 && (
        <section>
          <h3 className="font-bold text-emerald-800">O que você fez bem</h3>
          <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
            {s.wellDone.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}
      {s.corrections.length > 0 && (
        <section>
          <h3 className="font-bold text-amber-800">Para melhorar</h3>
          <ul className="mt-1 space-y-2 text-sm text-slate-700">
            {s.corrections.map((c) => (
              <li key={c.goalPt} className="rounded-xl bg-amber-50 p-3">
                <p className="font-semibold">{c.goalPt}</p>
                {c.answer && (
                  <p>
                    Você escreveu: <span lang={lang}>“{c.answer}”</span>
                  </p>
                )}
                {c.notes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
                <p>
                  Uma forma natural: <strong lang={lang}>{c.model}</strong>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {s.practice && (
        <p className="text-sm text-slate-700">
          🔁 Frase para praticar: <strong lang={lang}>{s.practice.phrase}</strong>
        </p>
      )}
      {s.reviewScheduled > 0 && (
        <p className="text-sm text-slate-700">
          🧠 {s.reviewScheduled} {s.reviewScheduled === 1 ? "palavra entrou" : "palavras entraram"} na sua revisão de hoje, por causa das etapas em que você teve dificuldade.
        </p>
      )}
      <p className="text-xs text-slate-500">A pontuação mede esta conversa, não o seu nível no idioma.</p>
      <div className="flex flex-wrap gap-2">
        {s.next ? (
          <ButtonLink href="/missoes">Próxima missão: {s.next.title}</ButtonLink>
        ) : (
          <ButtonLink href="/aprender">Continuar a trilha</ButtonLink>
        )}
        {s.reviewScheduled > 0 && (
          <ButtonLink href="/jogar/digitar?foco=revisao" variant="secondary">
            Revisar agora
          </ButtonLink>
        )}
        <ButtonLink href="/missoes" variant="ghost">
          Ver missões
        </ButtonLink>
      </div>
    </Card>
  );
}
