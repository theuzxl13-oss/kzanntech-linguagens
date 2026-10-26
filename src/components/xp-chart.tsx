"use client";

import { useState } from "react";

/** XP por dia (série única): barras com tooltip por barra e tabela acessível. */
export function XpChart({ data }: { data: { day: string; xp: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(10, ...data.map((d) => d.xp));
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const total = data.reduce((s, d) => s + d.xp, 0);
  return (
    <figure>
      <figcaption className="sr-only">XP ganho por dia nos últimos 14 dias (total {total} XP).</figcaption>
      <div className="relative" aria-hidden="true">
        <div className="flex h-36 items-end gap-[2px] border-b border-slate-200">
          {data.map((d, i) => (
            <div
              key={d.day}
              className="group relative flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className={`w-full rounded-t-[4px] ${hover === i ? "bg-brand-700" : "bg-brand-500"}`}
                style={{ height: `${d.xp ? Math.max(4, (d.xp / max) * 100) : 0}%` }}
              />
              {hover === i && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white shadow">
                  {label(d.day)} · <strong>{d.xp} XP</strong>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>{label(data[0].day)}</span>
          <span>hoje</span>
        </div>
      </div>
      <table className="sr-only">
        <thead>
          <tr>
            <th>Dia</th>
            <th>XP</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{label(d.day)}</td>
              <td>{d.xp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
