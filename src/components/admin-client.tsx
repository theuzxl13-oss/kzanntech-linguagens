"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Checkbox, Field, Input, Select, Textarea } from "./forms";
import { Alert, Button, Card } from "./ui";

function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, ok = "Salvo.") {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "success", text: ok });
      router.refresh();
      return true;
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Erro inesperado." });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { msg, busy, run, router };
}

export function ReviewButtons({ id, status }: { id: number; status: string }) {
  const a = useAction();
  const set = (s: string) => a.run(() => api(`/api/admin/items/${id}/review`, { body: { status: s } }), "Status atualizado.");
  return (
    <div className="flex flex-wrap gap-1">
      {status !== "approved" && (
        <Button size="sm" variant="success" disabled={a.busy} onClick={() => set("approved")}>
          Aprovar
        </Button>
      )}
      {status !== "archived" && (
        <Button size="sm" variant="ghost" disabled={a.busy} onClick={() => set("archived")}>
          Arquivar
        </Button>
      )}
      {status === "archived" && (
        <Button size="sm" variant="secondary" disabled={a.busy} onClick={() => set("pending_review")}>
          Restaurar
        </Button>
      )}
      {a.msg?.tone === "error" && <span className="text-xs text-rose-700">{a.msg.text}</span>}
    </div>
  );
}

export interface ItemFormValue {
  languageCode: string;
  categorySlug: string;
  levelCode: string;
  kind: "word" | "phrase";
  text: string;
  translationPt: string;
  explanation: string;
  exampleText: string;
  examplePt: string;
  formats: string[];
  reviewStatus: string;
  source: string;
  altTarget: string[];
  altPt: string[];
}

export function ItemEditor({
  id,
  initial,
  languages,
  categories,
  audio,
}: {
  id: number | null;
  initial: ItemFormValue;
  languages: { code: string; name_pt: string; locale: string }[];
  categories: { slug: string; name_pt: string }[];
  audio: { id: number; url: string; kind: string; locale: string; license: string | null; source: string | null }[];
}) {
  const a = useAction();
  const [v, setV] = useState(initial);
  const [alts, setAlts] = useState({ target: initial.altTarget.join("\n"), pt: initial.altPt.join("\n") });
  const [newAudio, setNewAudio] = useState({ url: "", kind: "recorded", license: "", source: "" });
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { ...v, altTarget: lines(alts.target), altPt: lines(alts.pt), explanation: v.explanation || null, exampleText: v.exampleText || null, examplePt: v.examplePt || null };
    if (id == null) {
      await a.run(async () => {
        const r = await api<{ id: number }>("/api/admin/items", { body });
        a.router.push(`/admin/conteudo/${r.id}`);
      }, "Item criado.");
    } else {
      await a.run(() => api(`/api/admin/items/${id}`, { method: "PUT", body }), "Item salvo.");
    }
  }

  const locale = languages.find((l) => l.code === v.languageCode)?.locale ?? "en-US";
  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Idioma" htmlFor="lang">
            <Select id="lang" value={v.languageCode} onChange={(e) => setV({ ...v, languageCode: e.target.value })}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>{l.name_pt}</option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria" htmlFor="cat">
            <Select id="cat" value={v.categorySlug} onChange={(e) => setV({ ...v, categorySlug: e.target.value })}>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name_pt}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nível (CEFR)" htmlFor="lvl">
            <Select id="lvl" value={v.levelCode} onChange={(e) => setV({ ...v, levelCode: e.target.value })}>
              {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo" htmlFor="kind">
            <Select id="kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as "word" | "phrase" })}>
              <option value="word">Palavra</option>
              <option value="phrase">Frase</option>
            </Select>
          </Field>
          <Field label="Texto no idioma (resposta principal)" htmlFor="text">
            <Input id="text" required value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} />
          </Field>
          <Field label="Tradução principal em português" htmlFor="pt">
            <Input id="pt" required value={v.translationPt} onChange={(e) => setV({ ...v, translationPt: e.target.value })} />
          </Field>
          <Field label="Alternativas aceitas no idioma (uma por linha)" htmlFor="altt" hint="Valem para escrita, escuta e fala.">
            <Textarea id="altt" rows={4} value={alts.target} onChange={(e) => setAlts({ ...alts, target: e.target.value })} />
          </Field>
          <Field label="Traduções alternativas em português (uma por linha)" htmlFor="altp" hint="Valem para o formato tradução.">
            <Textarea id="altp" rows={4} value={alts.pt} onChange={(e) => setAlts({ ...alts, pt: e.target.value })} />
          </Field>
          <Field label="Explicação / observação" htmlFor="exp">
            <Textarea id="exp" rows={2} value={v.explanation} onChange={(e) => setV({ ...v, explanation: e.target.value })} />
          </Field>
          <div className="grid gap-4">
            <Field label="Frase de exemplo (idioma)" htmlFor="ex">
              <Input id="ex" value={v.exampleText} onChange={(e) => setV({ ...v, exampleText: e.target.value })} />
            </Field>
            <Field label="Frase de exemplo (português)" htmlFor="expt">
              <Input id="expt" value={v.examplePt} onChange={(e) => setV({ ...v, examplePt: e.target.value })} />
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Exercícios habilitados</legend>
            {[
              ["translate", "Tradução (idioma → português)"],
              ["write", "Escrita (português → idioma)"],
              ["listen", "Escuta e digitação"],
              ["speak", "Pronúncia (Jogo com Vozes)"],
            ].map(([f, label]) => (
              <Checkbox
                key={f}
                id={`f-${f}`}
                label={label}
                checked={v.formats.includes(f)}
                onChange={(e) => setV({ ...v, formats: e.target.checked ? [...v.formats, f] : v.formats.filter((x) => x !== f) })}
              />
            ))}
          </fieldset>
          <div className="grid gap-4">
            <Field label="Status de revisão" htmlFor="st" hint="Rascunhos e arquivados não aparecem nos jogos.">
              <Select id="st" value={v.reviewStatus} onChange={(e) => setV({ ...v, reviewStatus: e.target.value })}>
                <option value="draft">Rascunho</option>
                <option value="pending_review">Pendente de revisão</option>
                <option value="approved">Aprovado</option>
                <option value="archived">Arquivado</option>
              </Select>
            </Field>
            <Field label="Fonte / responsável" htmlFor="src" hint="Ex.: dicionário consultado, professor revisor.">
              <Input id="src" required value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            {a.msg && <Alert tone={a.msg.tone} className="mb-3">{a.msg.text}</Alert>}
            <Button type="submit" disabled={a.busy}>{id == null ? "Criar item" : "Salvar alterações"}</Button>
          </div>
        </form>
      </Card>

      {id != null && (
        <Card>
          <h2 className="font-bold">Áudios de referência</h2>
          <p className="mt-1 text-sm text-slate-600">
            Associe gravações revisadas (caminho em <code>/public/audio/…</code> ou URL https). Sem áudio cadastrado, o sistema usa a síntese de voz do servidor (se configurada) ou do navegador.
          </p>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {audio.map((au) => (
              <li key={au.id} className="flex items-center justify-between gap-2 py-2">
                <span className="truncate">
                  <audio controls src={au.url} className="mr-2 inline h-8 align-middle" />
                  {au.kind === "recorded" ? "Gravado" : "Sintético"} · {au.license ?? "licença não informada"}
                </span>
                <Button size="sm" variant="ghost" onClick={() => a.run(() => api(`/api/admin/audio/${au.id}`, { method: "DELETE" }), "Áudio removido.")}>
                  Remover
                </Button>
              </li>
            ))}
            {!audio.length && <li className="py-2 text-slate-500">Nenhum áudio associado.</li>}
          </ul>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await a.run(
                () => api(`/api/admin/items/${id}/audio`, { body: { ...newAudio, locale, license: newAudio.license || undefined, source: newAudio.source || undefined } }),
                "Áudio associado.",
              );
              if (ok) setNewAudio({ url: "", kind: "recorded", license: "", source: "" });
            }}
          >
            <Field label="URL do áudio" htmlFor="aurl">
              <Input id="aurl" value={newAudio.url} placeholder="/audio/en/good-morning.mp3" onChange={(e) => setNewAudio({ ...newAudio, url: e.target.value })} />
            </Field>
            <Field label="Tipo" htmlFor="akind">
              <Select id="akind" value={newAudio.kind} onChange={(e) => setNewAudio({ ...newAudio, kind: e.target.value })}>
                <option value="recorded">Gravado por pessoa</option>
                <option value="synthetic">Sintético</option>
              </Select>
            </Field>
            <Field label="Licença" htmlFor="alic">
              <Input id="alic" value={newAudio.license} onChange={(e) => setNewAudio({ ...newAudio, license: e.target.value })} />
            </Field>
            <Button type="submit" variant="secondary" disabled={a.busy || !newAudio.url}>Adicionar áudio</Button>
          </form>
        </Card>
      )}
    </div>
  );
}

export function LanguageForm({ initial }: { initial?: { code: string; namePt: string; nativeName: string; flag: string; locale: string; isActive: boolean; sortOrder: number } }) {
  const a = useAction();
  const [v, setV] = useState(initial ?? { code: "", namePt: "", nativeName: "", flag: "", locale: "", isActive: true, sortOrder: 100 });
  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await a.run(() => api("/api/admin/languages", { body: v }), "Idioma salvo.");
      }}
    >
      <Field label="Código (ISO 639)" htmlFor={`lc-${initial?.code ?? "new"}`}>
        <Input id={`lc-${initial?.code ?? "new"}`} value={v.code} disabled={!!initial} onChange={(e) => setV({ ...v, code: e.target.value })} placeholder="pt" />
      </Field>
      <Field label="Nome em português" htmlFor={`ln-${initial?.code ?? "new"}`}>
        <Input id={`ln-${initial?.code ?? "new"}`} value={v.namePt} onChange={(e) => setV({ ...v, namePt: e.target.value })} />
      </Field>
      <Field label="Nome nativo" htmlFor={`lnn-${initial?.code ?? "new"}`}>
        <Input id={`lnn-${initial?.code ?? "new"}`} value={v.nativeName} onChange={(e) => setV({ ...v, nativeName: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Bandeira" htmlFor={`lf-${initial?.code ?? "new"}`}>
          <Input id={`lf-${initial?.code ?? "new"}`} value={v.flag} onChange={(e) => setV({ ...v, flag: e.target.value })} />
        </Field>
        <Field label="Locale" htmlFor={`ll-${initial?.code ?? "new"}`}>
          <Input id={`ll-${initial?.code ?? "new"}`} value={v.locale} onChange={(e) => setV({ ...v, locale: e.target.value })} placeholder="ja-JP" />
        </Field>
      </div>
      <div className="flex items-center gap-4 sm:col-span-4">
        <Checkbox id={`la-${initial?.code ?? "new"}`} label="Ativo" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} />
        <Button type="submit" size="sm" disabled={a.busy}>{initial ? "Salvar" : "Adicionar idioma"}</Button>
        {a.msg && <span className={a.msg.tone === "error" ? "text-sm text-rose-700" : "text-sm text-emerald-700"}>{a.msg.text}</span>}
      </div>
    </form>
  );
}

export function CategoryForm({ initial }: { initial?: { slug: string; namePt: string; icon: string; sortOrder: number } }) {
  const a = useAction();
  const [v, setV] = useState(initial ?? { slug: "", namePt: "", icon: "📚", sortOrder: 100 });
  const key = initial?.slug ?? "new";
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await a.run(() => api("/api/admin/categories", { body: v }), "Categoria salva.");
      }}
    >
      <div className="w-16">
        <Field label="Ícone" htmlFor={`ci-${key}`}>
          <Input id={`ci-${key}`} value={v.icon} onChange={(e) => setV({ ...v, icon: e.target.value })} />
        </Field>
      </div>
      <div className="w-40">
        <Field label="Identificador" htmlFor={`cs-${key}`}>
          <Input id={`cs-${key}`} value={v.slug} disabled={!!initial} onChange={(e) => setV({ ...v, slug: e.target.value })} />
        </Field>
      </div>
      <div className="min-w-48 flex-1">
        <Field label="Nome" htmlFor={`cn-${key}`}>
          <Input id={`cn-${key}`} value={v.namePt} onChange={(e) => setV({ ...v, namePt: e.target.value })} />
        </Field>
      </div>
      <Button type="submit" size="sm" variant="secondary" disabled={a.busy}>{initial ? "Salvar" : "Adicionar"}</Button>
      {a.msg?.tone === "error" && <span className="text-sm text-rose-700">{a.msg.text}</span>}
    </form>
  );
}

export function SeasonForm() {
  const a = useAction();
  const next = new Date();
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  const [v, setV] = useState({ name: "", endsAt: next.toISOString().slice(0, 10) });
  return (
    <form
      className="grid gap-3 sm:grid-cols-3 sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!confirm("Encerrar a temporada atual agora? O placar final será congelado e a pontuação competitiva reiniciará.")) return;
        await a.run(() => api("/api/admin/seasons", { body: { name: v.name, endsAt: new Date(`${v.endsAt}T00:00:00Z`).toISOString() } }), "Nova temporada iniciada.");
      }}
    >
      <Field label="Nome da nova temporada" htmlFor="sn">
        <Input id="sn" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Temporada especial" />
      </Field>
      <Field label="Termina em (UTC)" htmlFor="se">
        <Input id="se" type="date" required value={v.endsAt} onChange={(e) => setV({ ...v, endsAt: e.target.value })} />
      </Field>
      <Button type="submit" variant="danger" disabled={a.busy}>Encerrar atual e iniciar nova</Button>
      {a.msg && <Alert tone={a.msg.tone} className="sm:col-span-3">{a.msg.text}</Alert>}
    </form>
  );
}

export function ScoringEditor({ initial }: { initial: unknown }) {
  const a = useAction();
  const [text, setText] = useState(JSON.stringify(initial, null, 2));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return alert("JSON inválido.");
        }
        await a.run(() => api("/api/admin/scoring", { method: "PUT", body: parsed }), "Regras salvas (nova versão).");
      }}
      className="space-y-3"
    >
      <label htmlFor="rules" className="sr-only">Regras de pontuação (JSON)</label>
      <Textarea id="rules" rows={22} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
      {a.msg && <Alert tone={a.msg.tone}>{a.msg.text}</Alert>}
      <Button type="submit" disabled={a.busy}>Salvar regras</Button>
    </form>
  );
}

export function UserActions({ id, status, role }: { id: string; status: string; role: string }) {
  const a = useAction();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {status === "active" ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>Suspender…</Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={a.busy} onClick={() => a.run(() => api(`/api/admin/users/${id}`, { method: "PATCH", body: { action: "reactivate" } }), "Reativado.")}>
            Reativar
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={a.busy}
          onClick={() => {
            if (confirm(role === "admin" ? "Remover papel de administrador?" : "Tornar este usuário administrador?"))
              a.run(() => api(`/api/admin/users/${id}`, { method: "PATCH", body: { action: "set_role", role: role === "admin" ? "user" : "admin" } }), "Papel alterado.");
          }}
        >
          {role === "admin" ? "Remover admin" : "Tornar admin"}
        </Button>
      </div>
      {open && (
        <form
          className="flex gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await a.run(() => api(`/api/admin/users/${id}`, { method: "PATCH", body: { action: "suspend", reason } }), "Suspenso.")) setOpen(false);
          }}
        >
          <label htmlFor={`r-${id}`} className="sr-only">Motivo da suspensão</label>
          <Input id={`r-${id}`} placeholder="Motivo (registrado na auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} className="py-1.5" />
          <Button size="sm" variant="danger" type="submit" disabled={a.busy}>Confirmar</Button>
        </form>
      )}
      {a.msg?.tone === "error" && <span className="text-xs text-rose-700">{a.msg.text}</span>}
    </div>
  );
}
