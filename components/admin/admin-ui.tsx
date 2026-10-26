import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

/** Small shared building blocks so every admin page looks and behaves the same. */

export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-[#e8e0d8] bg-white ${className}`}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-[#f0e9e2] px-4 py-3">
          <h2 className="text-[15px] font-semibold text-[#282321]">{title}</h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

const TONES = {
  neutral: "bg-[#f3efeb] text-[#6d6260]",
  brand: "bg-[#f6e7e9] text-[#7d1f2a]",
  success: "bg-[#e4f2e8] text-[#28633b]",
  warning: "bg-[#fbf0d4] text-[#8a5a00]",
  danger: "bg-[#fbe3e3] text-[#a3262a]",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function EmptyState({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f6f1ec] text-[#9a8e86]"><Icon name={icon} className="h-6 w-6" /></span>
      <p className="mt-3 text-sm font-semibold text-[#282321]">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-[13px] text-[#7a6f6a]">{hint}</p> : null}
    </div>
  );
}
