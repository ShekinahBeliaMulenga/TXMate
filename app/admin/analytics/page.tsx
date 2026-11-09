import Link from "next/link";
import type { ReactNode } from "react";
import AdminPage from "@/components/admin/admin-page";
import { AreaChart, Donut, HBars, PALETTE, Ring, Sparkline } from "@/components/admin/charts";
import { getAnalytics } from "@/lib/admin/analytics";
import { parseRange, RANGE_WEEKS, type Kpi } from "@/lib/admin/analytics-types";
import { requireAdminPage } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

const [MAROON, GOLD, GREEN, BLUE, PLUM, STONE, ORANGE] = PALETTE;
const REQUEST_COLORS: Record<string, string> = { Requested: GOLD, Accepted: GREEN, Declined: MAROON, Cancelled: STONE, Expired: PLUM };
const SESSION_COLORS: Record<string, string> = { Upcoming: BLUE, "In progress": GOLD, "Ended, awaiting confirmation": ORANGE, "No response": PLUM, "Needs review": MAROON, Completed: GREEN, "No show": "#c93a3a", Cancelled: STONE };
const KPI_STYLE: Record<string, { color: string; series: "students" | "mates" | "requests" | "completed" }> = {
  students: { color: BLUE, series: "students" }, mates: { color: PLUM, series: "mates" }, requests: { color: GOLD, series: "requests" }, completed: { color: GREEN, series: "completed" },
};

const percent = (value: number | null) => (value === null ? "No data" : `${Math.round(value * 100)}%`);
const TILE = "rounded-xl border border-[#e4dfd9] bg-white shadow-[0_1px_2px_rgba(31,26,23,0.04)]";

function Tile({ title, hint, children, className = "" }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`${TILE} p-5 ${className}`}>
      <div className="mb-4"><h2 className="text-sm font-semibold text-[#1f1a17]">{title}</h2>{hint ? <p className="mt-0.5 text-xs text-[#7a716a]">{hint}</p> : null}</div>
      {children}
    </section>
  );
}

function Delta({ current, previous, points = false }: { current: number | null; previous: number | null; points?: boolean }) {
  if (current === null || previous === null) return <span className="text-xs text-[#7a716a]">No earlier period to compare</span>;
  const diff = points ? Math.round((current - previous) * 100) : current - previous;
  if (diff === 0) return <span className="inline-flex rounded-full bg-[#f1ede8] px-2 py-0.5 text-xs font-medium text-[#6b635d]">No change</span>;
  const pct = !points && previous > 0 ? ` (${diff > 0 ? "+" : ""}${Math.round((diff / previous) * 100)}%)` : "";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${diff > 0 ? "bg-[#e6f4ec] text-[#1f7a43]" : "bg-[#fbe9e9] text-[#b02a2a]"}`}>{diff > 0 ? "▲ +" : "▼ "}{diff}{points ? " pts" : ""}{pct}</span>;
}

function Card({ kpi, spark }: { kpi: Kpi; spark: number[] }) {
  const style = KPI_STYLE[kpi.key] ?? { color: MAROON };
  return (
    <div className={`${TILE} overflow-hidden p-5`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-[#6b635d]">{kpi.label}</p>
        <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 rounded-full" style={{ background: style.color }} />
      </div>
      <p className="mt-2 text-4xl font-semibold leading-none tracking-tight tabular-nums text-[#1f1a17]">{kpi.current}</p>
      <div className="mt-3 flex items-center gap-2"><Delta current={kpi.current} previous={kpi.previous} /><span className="text-xs text-[#7a716a]">vs before</span></div>
      <div className="-mx-5 -mb-5 mt-3"><Sparkline values={spark} color={style.color} label={`${kpi.label}, week by week`} /></div>
    </div>
  );
}

const segment = (active: boolean) => `rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${active ? "bg-[#7d1f2a] text-white shadow-sm" : "text-[#4e4742] hover:bg-[#f1ede8]"}`;

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ u?: string; weeks?: string }> }) {
  const admin = await requireAdminPage("analytics:view");
  const query = await searchParams;
  const weeks = parseRange(query.weeks);
  const report = await getAnalytics(admin, { weeks, universityId: query.u && query.u.length <= 100 ? query.u : null });
  const link = (u: string | null, w: number) => `/admin/analytics?${new URLSearchParams({ ...(u ? { u } : {}), weeks: String(w) }).toString()}`;
  const scopeName = report.universityId ? report.universityOptions.find((item) => item.id === report.universityId)?.name ?? "this university" : "all your universities";
  const labels = report.weeks.map((week) => week.label);
  const maxUni = Math.max(1, ...report.byUniversity.map((row) => row.requests));

  return (
    <AdminPage width="7xl" title="Analytics" description={`Real counts for ${scopeName}, the last ${weeks} weeks, compared with the ${weeks} weeks before. Nothing is estimated.`}>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div role="group" aria-label="Period" className="inline-flex w-fit gap-1 rounded-lg border border-[#e4dfd9] bg-white p-1">
            {RANGE_WEEKS.map((value) => <Link key={value} href={link(report.universityId, value)} aria-current={value === weeks ? "true" : undefined} className={segment(value === weeks)}>{value} weeks</Link>)}
          </div>
          {report.universityOptions.length > 1 ? (
            <div role="group" aria-label="University" className="flex flex-wrap gap-1 rounded-lg border border-[#e4dfd9] bg-white p-1">
              <Link href={link(null, weeks)} aria-current={report.universityId === null ? "true" : undefined} className={segment(report.universityId === null)}>All</Link>
              {report.universityOptions.map((item) => <Link key={item.id} href={link(item.id, weeks)} title={item.name} aria-current={report.universityId === item.id ? "true" : undefined} className={segment(report.universityId === item.id)}>{item.code}</Link>)}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{report.kpis.map((kpi) => <Card key={kpi.key} kpi={kpi} spark={report.weeks.map((week) => week[KPI_STYLE[kpi.key]?.series ?? "students"])} />)}</div>

        <div className="grid gap-4 md:grid-cols-3">
          <Tile title="Requests accepted" hint="Share of answered requests">
            <div className="flex items-center gap-4"><Ring value={report.acceptance.current} color={GREEN} label={`Requests accepted: ${percent(report.acceptance.current)}`} /><div className="min-w-0"><p className="text-sm text-[#4e4742]">of {report.acceptance.answered} answered {report.acceptance.answered === 1 ? "request" : "requests"}</p><p className="mt-2"><Delta current={report.acceptance.current} previous={report.acceptance.previous} points /></p></div></div>
          </Tile>
          <Tile title="Sessions completed" hint="Share of settled sessions">
            <div className="flex items-center gap-4"><Ring value={report.completion.current} color={MAROON} label={`Sessions completed: ${percent(report.completion.current)}`} /><div className="min-w-0"><p className="text-sm text-[#4e4742]">of {report.completion.ended} {report.completion.ended === 1 ? "session" : "sessions"} that ended</p><p className="mt-2"><Delta current={report.completion.current} previous={report.completion.previous} points /></p></div></div>
            <details className="mt-4 text-xs text-[#6b635d]"><summary className="cursor-pointer font-medium text-[#7d1f2a]">How this is worked out</summary>
              <p className="mt-2 leading-5">Counts sessions whose scheduled end fell in this period and that are now completed, no-show, cancelled, needing review, or unanswered for a day. Sessions still inside their first day of confirmation are left out until they settle.</p>
              <ul className="mt-2 space-y-0.5">{report.completion.parts.map((part) => <li key={part.label} className="flex justify-between gap-3"><span>{part.label}</span><span className="font-semibold tabular-nums text-[#1f1a17]">{part.value}</span></li>)}</ul>
            </details>
          </Tile>
          <Tile title="Average rating" hint="Reviews students can see">
            <div className="flex items-end gap-2"><p className="text-4xl font-semibold leading-none tabular-nums text-[#1f1a17]">{report.rating.average === null ? "–" : report.rating.average}</p><p className="pb-0.5 text-sm text-[#6b635d]">{report.rating.average === null ? "No reviews yet" : `out of 5 · ${report.rating.count} ${report.rating.count === 1 ? "review" : "reviews"}`}</p></div>
            <div className="mt-4"><HBars color={GOLD} items={[5, 4, 3, 2, 1].map((stars) => ({ label: `${stars} ${stars === 1 ? "star" : "stars"}`, value: report.rating.distribution[stars - 1] ?? 0 }))} /></div>
          </Tile>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Tile title="People joining, by week" className="lg:col-span-2"><AreaChart id="join" label="New students and new Academic Mates by week" labels={labels} series={[{ name: "New students", values: report.weeks.map((week) => week.students), color: BLUE }, { name: "New Academic Mates", values: report.weeks.map((week) => week.mates), color: PLUM }]} /></Tile>
          <Tile title="Requests by outcome"><Donut label="Requests by outcome" centerLabel="requests" slices={report.requestMix} colors={REQUEST_COLORS} /></Tile>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Tile title="Tutoring activity, by week" className="lg:col-span-2"><AreaChart id="tutor" label="Requests made and sessions completed by week" labels={labels} series={[{ name: "Requests made", values: report.weeks.map((week) => week.requests), color: GOLD }, { name: "Sessions completed", values: report.weeks.map((week) => week.completed), color: GREEN }]} /></Tile>
          <Tile title="Sessions by state"><Donut label="Sessions by state" centerLabel="sessions" slices={report.sessionMix} colors={SESSION_COLORS} /></Tile>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Tile title="Most requested courses">{report.topCourses.length === 0 ? <p className="text-sm text-[#6b635d]">No requests in this period.</p> : <HBars color={MAROON} items={report.topCourses.map((course) => ({ label: course.course, sub: course.name, value: course.requests }))} />}</Tile>
          <Tile title="By university" hint="Requests are for the period; people are all time">
            <ul className="divide-y divide-[#eee9e3]">
              {report.byUniversity.map((row) => (
                <li key={row.code} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3"><p className="min-w-0 break-words text-[13px]"><span className="font-semibold">{row.code}</span> <span className="text-[#6b635d]">{row.name}</span></p><p className="shrink-0 text-[13px] font-semibold tabular-nums">{row.requests} <span className="font-normal text-[#7a716a]">requests</span></p></div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-[#f1ede8]"><div className="h-1.5 rounded-full" style={{ width: `${Math.max(row.requests ? 3 : 0, (row.requests / maxUni) * 100)}%`, background: MAROON }} /></div>
                  <p className="mt-1.5 text-xs text-[#7a716a]">{row.students} students · {row.mates} Academic Mates</p>
                </li>
              ))}
            </ul>
          </Tile>
        </div>
      </div>
    </AdminPage>
  );
}
