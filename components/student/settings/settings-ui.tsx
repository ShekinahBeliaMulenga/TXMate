
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

/** Shared look for every settings screen: tokens, icons and small presentational pieces. */

export const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2";
export const INPUT =
  "w-full rounded-lg border border-[#ded3ca] bg-white px-3 py-2 text-[13px] text-[#282321] outline-none transition placeholder:text-[#a79b95] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10";
export const INPUT_READONLY =
  "w-full rounded-lg border border-[#e8e0d8] bg-[#f3efeb] px-3 py-2 text-[13px] text-[#8a7f7a]";
export const LABEL = "block text-[13px] font-semibold text-[#282321]";
export const HINT = "mt-1 text-[11px] leading-4 text-[#7a6f6a]";

export { Icon, type IconName };

/** Rounded maroon-tinted square holding an icon. Used by menu rows. */
export function IconTile({ name }: { name: IconName }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f6e7e9] text-[#7d1f2a]">
      <Icon name={name} className="h-[18px] w-[18px]" />
    </span>
  );
}

/** Screen title and subtitle. */
export function ScreenHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header>
      <h1 className="text-xl font-semibold tracking-tight text-[#282321] sm:text-2xl">{title}</h1>
      <p className="mt-1 text-[13px] leading-5 text-[#6d6260]">{subtitle}</p>
    </header>
  );
}

/** Grey info box with an icon, used for guidance and "managed by TXMate" notes. */
export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-[#f3efeb] px-3 py-2.5 text-xs leading-4 text-[#6d6260]">
      <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-[#7a6f6a]" />
      <span>{children}</span>
    </p>
  );
}

/** White surface that groups related content on a screen. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-[#ece5de] bg-white p-3 sm:p-4 ${className}`}>{children}</div>;
}

export function Toggle({ checked, onChange, label, description, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; description: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-5 text-[#282321]">{label}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-[#7a6f6a]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-wait disabled:opacity-60 ${FOCUS} ${checked ? "bg-[#7d1f2a]" : "bg-[#d9cec5]"}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );
}
