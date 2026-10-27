import Image from "next/image";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { initials } from "./format";

export { Icon, type IconName };

export const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2";

/** A titled block inside a tab. Headings carry a small maroon icon, no heavy card chrome. */
export function Block({ title, icon, aside, children }: { title: string; icon?: IconName; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#282321]">
          {icon ? <Icon name={icon} className="h-4 w-4 text-[#7d1f2a]" /> : null}
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** White surface that groups the blocks of one tab. */
export function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-[#efe8e1] rounded-xl border border-[#ece5de] bg-white p-3 sm:p-4 ${className}`}>{children}</div>;
}

export function Empty({ text }: { text: string }) {
  return <p className="text-[13px] text-[#7a6f6a]">{text}</p>;
}

export function Stars({ rating, className = "h-3.5 w-3.5" }: { rating: number; className?: string }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Icon key={index} name="star" className={`${className} ${index < rating ? "fill-amber-500 text-amber-500" : "text-[#d8cec5]"}`} />
      ))}
    </span>
  );
}

export function Avatar({ name, image, size = 40 }: { name: string; image: string | null; size?: number }) {
  const dimension = { width: size, height: size };
  return image ? (
    <Image src={image} alt={name} width={size} height={size} unoptimized className="shrink-0 rounded-full object-cover" style={dimension} />
  ) : (
    <div aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-full bg-[#f2e9e4] text-xs font-semibold text-[#7d1f2a]" style={dimension}>
      {initials(name)}
    </div>
  );
}