import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { FOCUS } from "./admin-ui";

/** Underline tabs: the standard way to switch a list between states (Open / Resolved, Pending / Verified…). */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: ReadonlyArray<{ id: T; label: string; count?: number }>; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-5 overflow-x-auto overflow-y-hidden border-b border-[#e4dfd9] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`flex h-11 shrink-0 items-center gap-2 border-b-2 text-sm font-medium transition-colors ${FOCUS} ${active ? "border-[#7d1f2a] text-[#1f1a17]" : "border-transparent text-[#6b635d] hover:text-[#1f1a17]"}`}
          >
            {tab.label}
            {tab.count !== undefined ? <span className="rounded bg-[#f1ede8] px-1.5 text-xs tabular-nums text-[#6b635d]">{tab.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Rectangular search box for toolbars. */
export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-sm">
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f88]" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        maxLength={100}
        className={`h-10 w-full rounded-md border border-[#d9d3cc] bg-white pl-9 pr-3 text-sm placeholder:text-[#a39a93] ${FOCUS}`}
      />
    </div>
  );
}

/** Native select (best on phones) with a label that stays visible. */
export function SelectField<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: ReadonlyArray<{ id: T; label: string }> }) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-[13px] text-[#6b635d]">
      <span className="shrink-0">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)} className={`h-10 min-w-0 rounded-md border border-[#d9d3cc] bg-white px-2.5 text-sm text-[#1f1a17] ${FOCUS}`}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

/** Row of filters above a table; stacks on phones. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}

export function GhostButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#d9d3cc] bg-white px-4 text-sm font-medium text-[#3a332f] transition-colors hover:bg-[#faf8f6] disabled:opacity-60 ${FOCUS} ${props.className ?? ""}`}>{children}</button>;
}

export function PrimaryButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#7d1f2a] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#691923] disabled:opacity-50 ${FOCUS} ${props.className ?? ""}`}>{children}</button>;
}

/** Labelled text input with optional hint, used by the admin forms. */
export function TextField({ label, hint, ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-[#3a332f]">{label}</span>
      <input {...props} className={`mt-1 h-10 w-full rounded-md border border-[#d9d3cc] bg-white px-3 text-sm placeholder:text-[#a39a93] ${FOCUS}`} />
      {hint ? <span className="mt-1 block text-xs text-[#7a716a]">{hint}</span> : null}
    </label>
  );
}

/** Two labelled date inputs (From / To) for filtering a list by day. Empty means no limit on that side. */
export function DateRangeFields({ from, to, onFrom, onTo, fromLabel, toLabel }: { from: string; to: string; onFrom: (value: string) => void; onTo: (value: string) => void; fromLabel: string; toLabel: string }) {
  const input = `h-10 min-w-0 rounded-md border border-[#d9d3cc] bg-white px-2.5 text-sm text-[#1f1a17] ${FOCUS}`;
  return (
    <>
      <label className="flex min-w-0 items-center gap-2 text-[13px] text-[#6b635d]">
        <span className="shrink-0">From</span>
        <input type="date" value={from} max={to || undefined} onChange={(event) => onFrom(event.target.value)} aria-label={fromLabel} className={input} />
      </label>
      <label className="flex min-w-0 items-center gap-2 text-[13px] text-[#6b635d]">
        <span className="shrink-0">To</span>
        <input type="date" value={to} min={from || undefined} onChange={(event) => onTo(event.target.value)} aria-label={toLabel} className={input} />
      </label>
      {from || to ? <GhostButton onClick={() => { onFrom(""); onTo(""); }}>Clear dates</GhostButton> : null}
    </>
  );
}
