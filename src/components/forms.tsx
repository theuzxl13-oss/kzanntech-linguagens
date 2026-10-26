import type { ComponentProps, ReactNode } from "react";
import { cn } from "./ui";

export function Field({ label, htmlFor, hint, error, children }: { label: ReactNode; htmlFor: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-800">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-200 disabled:bg-slate-100 sm:text-sm";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, className)} {...props} />;
}

export function Checkbox({ label, id, ...props }: ComponentProps<"input"> & { label: ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600" {...props} />
      <span>{label}</span>
    </label>
  );
}
