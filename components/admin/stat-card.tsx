import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";

/** One headline number. Links to the page where it can be acted on, when there is one. */
export default function StatCard({ label, value, icon, href, attention = false }: { label: string; value: number | string; icon: IconName; href?: string; attention?: boolean }) {
  const body = (
    <div className={`flex items-center gap-4 rounded-2xl border bg-white p-4 transition ${attention ? "border-[#e3cfd2]" : "border-[#ece5de]"} ${href ? "hover:border-[#c9a9ad]" : ""}`}>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${attention ? "bg-[#7d1f2a] text-white" : "bg-[#f6e7e9] text-[#7d1f2a]"}`}>
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none tabular-nums text-[#282321]">{value}</p>
        <p className="mt-1 text-[13px] text-[#6d6260]">{label}</p>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2 rounded-2xl">{body}</Link> : body;
}
