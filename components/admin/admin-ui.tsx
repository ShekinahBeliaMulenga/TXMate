import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * The admin design kit. Flat surfaces, hairline borders, small type and tabular numbers: the look of
 * a tool people live in all day, not a page of cards. Everything here is server-safe (no hooks).
 */

export const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40";

/** A bordered surface. With a title it gets a quiet header row. */
export function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-[#e4dfd9] bg-white ${className}`}>
      {title ? (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[#eee9e3] px-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#6b635d]">{title}</h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Backwards-compatible alias used by earlier pages. */
export const Card = Panel;

const DOT = {
  neutral: "bg-[#a39a93]",
  brand: "bg-[#7d1f2a]",
  success: "bg-[#2f8f4e]",
  warning: "bg-[#d99a0b]",
  danger: "bg-[#c93a3a]",
} as const;

export type BadgeTone = keyof typeof DOT;

/** Status as a coloured dot plus text: readable at a glance and calmer than filled pills. */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-[#3a332f]">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon: IconName; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#e4dfd9] text-[#9a8f88]"><Icon name={icon} className="h-5 w-5" /></span>
      <p className="mt-3 text-sm font-semibold text-[#1f1a17]">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-[13px] leading-5 text-[#6b635d]">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Table styling in one place. Secondary columns use `hide` so phones get a clean two-line row. */
export const TABLE = {
  wrap: "w-full overflow-x-auto",
  table: "w-full border-collapse text-left text-sm",
  th: "border-b border-[#e4dfd9] bg-[#faf9f7] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#7a716a] whitespace-nowrap",
  td: "border-b border-[#eee9e3] px-4 py-3 align-middle text-[#1f1a17]",
  row: "transition-colors hover:bg-[#faf8f6]",
  hide: "hidden md:table-cell",
  hideSm: "hidden sm:table-cell",
} as const;

/** One label/value pair for a stats strip. */
export function Stat({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: "attention" }) {
  const body = (
    <div className="px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">{label}</p>
      <p className={`mt-1.5 text-3xl font-semibold leading-none tabular-nums ${tone === "attention" ? "text-[#7d1f2a]" : "text-[#1f1a17]"}`}>{value}</p>
    </div>
  );
  return href ? <Link href={href} className={`block transition-colors hover:bg-[#faf8f6] ${FOCUS}`}>{body}</Link> : body;
}

/** A single bordered strip of figures separated by hairlines (2 columns on phones, 4 on desktop). */
export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[#e4dfd9] bg-white lg:grid-cols-4 [&>*]:outline [&>*]:outline-1 [&>*]:outline-[#eee9e3]">{children}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-[#d9d3cc] bg-[#faf9f7] px-1.5 py-0.5 font-mono text-[11px] text-[#6b635d]">{children}</kbd>;
}
