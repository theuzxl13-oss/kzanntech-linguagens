import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300",
  secondary: "bg-white text-slate-800 border border-slate-300 shadow-sm hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400",
  ghost: "text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:text-slate-400",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700 disabled:bg-rose-300",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:bg-emerald-300",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-13 px-6 text-base gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-xl font-semibold transition-colors select-none disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-slate-200 bg-white p-5 shadow-sm", className)} {...props} />;
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="text-lg font-bold text-slate-900">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const BADGE: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700",
  brand: "bg-brand-100 text-brand-800",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-900",
  rose: "bg-rose-100 text-rose-800",
  sky: "bg-sky-100 text-sky-800",
};

export function Badge({ color = "slate", className, ...props }: ComponentProps<"span"> & { color?: keyof typeof BADGE }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", BADGE[color], className)} {...props} />;
}

const ALERT: Record<string, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  error: "border-rose-200 bg-rose-50 text-rose-900",
};

export function Alert({ tone = "info", title, children, className, role }: { tone?: keyof typeof ALERT; title?: ReactNode; children?: ReactNode; className?: string; role?: string }) {
  return (
    <div role={role ?? (tone === "error" ? "alert" : "status")} className={cn("rounded-xl border px-4 py-3 text-sm", ALERT[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function ProgressBar({ value, max = 1, label, className, color = "brand" }: { value: number; max?: number; label: string; className?: string; color?: "brand" | "green" | "amber" }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bar = color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-500" : "bg-brand-500";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 100) / 100}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-slate-200", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export const AVATAR_EMOJI: Record<string, string> = {
  fox: "🦊",
  cat: "🐱",
  owl: "🦉",
  panda: "🐼",
  rabbit: "🐰",
  bear: "🐻",
  koala: "🐨",
  penguin: "🐧",
  frog: "🐸",
  lion: "🦁",
};
export const AVATAR_BG: Record<string, string> = {
  violet: "bg-brand-100",
  teal: "bg-teal-100",
  amber: "bg-amber-100",
  rose: "bg-rose-100",
  sky: "bg-sky-100",
  lime: "bg-lime-100",
  slate: "bg-slate-200",
};

export function Avatar({ avatar, color, size = "md", label }: { avatar: string; color: string; size?: "sm" | "md" | "lg"; label?: string }) {
  const s = size === "sm" ? "h-8 w-8 text-lg" : size === "lg" ? "h-16 w-16 text-4xl" : "h-10 w-10 text-2xl";
  return (
    <span role="img" aria-label={label ?? "Avatar"} className={cn("inline-flex shrink-0 items-center justify-center rounded-full", s, AVATAR_BG[color] ?? "bg-slate-200")}>
      {AVATAR_EMOJI[avatar] ?? "🙂"}
    </span>
  );
}

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#6038eb" />
        <rect x="12" y="16" width="40" height="30" rx="7" fill="#fff" />
        <rect x="12" y="40" width="40" height="6" rx="3" fill="#d5ccff" />
        <path d="M24 25v8M30 22v14M36 26v6M42 24v10" stroke="#6038eb" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      <span className={cn("text-xl", dark ? "text-white" : "text-slate-900")}>
        Key<span className={dark ? "text-brand-300" : "text-brand-600"}>Lingo</span>
      </span>
    </span>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon && <span aria-hidden="true">{icon}</span>}
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-4xl" aria-hidden="true">
        {icon}
      </p>
      <p className="mt-2 font-semibold text-slate-800">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-600">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LeagueBadge({ code, name }: { code: string; name: string }) {
  const style: Record<string, string> = {
    bronze: "bg-orange-100 text-orange-900",
    silver: "bg-slate-200 text-slate-800",
    gold: "bg-amber-100 text-amber-900",
    platinum: "bg-cyan-100 text-cyan-900",
    diamond: "bg-sky-100 text-sky-900",
    master: "bg-brand-100 text-brand-900",
  };
  const icon: Record<string, string> = { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💠", diamond: "💎", master: "👑" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", style[code] ?? "bg-slate-100")}>
      <span aria-hidden="true">{icon[code] ?? "🏅"}</span>
      {name}
    </span>
  );
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}min` : `${m}min`;
}

export function formatPercent(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

export function formatDate(d: Date | string, withTime = false) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Sao_Paulo",
  }).format(new Date(d));
}
