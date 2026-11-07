import Link from "next/link";
import type { ReactNode } from "react";
import AdminPage from "@/components/admin/admin-page";
import { Columns, Donut, HBars, LineChart, PBI } from "@/components/admin/charts";
import { getAnalytics } from "@/lib/admin/analytics";
import { parseRange, RANGE_WEEKS, type Kpi } from "@/lib/admin/analytics-types";
import { requireAdminPage } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

const percent = (value: number | null) => (value === null ? "No data" : `${Math.round(value * 100)}%`);

/** A report tile: white, thin border, small bold title. The look of a Power BI visual. */
function Tile({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-sm border border-[#d2d0ce] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${className}`}>
      <h2 className="border-b border-[#edebe9] px-4 py-2.5 text-[13px] font-semibold text-[#201f1e]">{title}</h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Delta({ current, previous, percentPoints = false }: { current: number | null; previous: number | null; percentPoints?: boolean }) {
  if (current === null || previous === null) return <span className="text-xs text-[#605e5c]">No earlier period to compare</span>;
  const diff = percentPoints ? Math.round((current - previous) * 100) : current - previous;
  if (diff === 0) return <span className="text-xs text-[#605e5c]">No change from the period before</span>;
  const pct = !percentPoints && previous > 0 ? ` (${diff > 0 ? "+" : ""}${Math.round((diff / previous) * 100)}%)` : "";
  return <span className={`text-xs font-medium ${diff > 0 ? "text-[#107c10]" : "text-[#d13438]"}`}>{diff > 0 ? "▲" : "▼"} {diff > 0 ? "+" : ""}{diff}{percentPoints ? " pts" : ""}{pct} <span className="font-normal text-[#605e5c]">from the period before</span></span>;
}

function Card({ kpi }: { kpi: Kpi }) {
  return (
    <div className="rounded-sm border border-[#d2d0ce] border-t-4 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]" style={{ borderTopColor: PBI[["students", "mates", "requests", "completed"].indexOf(kpi.key)] }}>
      <p className="text-xs font-semibold text-[#605e5c]">{kpi.label}</p>
      <p className="mt-1 text-4xl font-light leading-none tabular-nums text-[#201f1e]">{kpi.current}</p>
      <p className="mt-2"><Delta current={kpi.current} previous={kpi.previous} /></p>
    </div>
  );
}

function Slicer({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-[#605e5c]">{label}</span><div className="flex flex-wrap gap-1.5">{children}</div></div>;
}
const chip = (active: boolean) => `rounded-sm border px-3 py-1.5 text-[13px] ${active ? "border-[#01b8aa] bg-[#01b8aa] font-semibold text-white" : "border-[#c8c6c4] bg-white text-[#323130] hover:bg-[#f3f2f1]"}`;

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ u?: string; weeks?: string }> }) {
  const admin = await requireAdminPage("analytics:view");
  const query = await searchParams;
  const weeks = parseRange(query.weeks);
  const report = await getAnalytics(admin, { weeks, universityId: query.u && query.u.length <= 100 ? query.u : null });
  const link = (u: string | null, w: number) => `/admin/analytics?${new URLSearchParams({ ...(u ? { u } : {}), weeks: String(w) }).toString()}`;
  const scopeName = report.universityId ? report.universityOptions.find((item) => item.id === report.universityId)?.name ?? "this university" : "all your universities";

  return (
    <AdminPage width="7xl" title="Analytics" description={`Real counts for ${scopeName}, the last ${weeks} weeks, compared with the ${weeks} weeks before. Nothing is estimated.`}>
      <div className="-mx-4 -my-6 space-y-4 bg-[#f3f2f1] px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3 rounded-sm border border-[#d2d0ce] bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
          <Slicer label="Period">{RANGE_WEEKS.map((value) => <Link key={value} href={link(report.universityId, value)} className={chip(value === weeks)}>{value} weeks</Link>)}</Slicer>
          {report.universityOptions.length > 1 ? (
            <Slicer label="University">
              <Link href={link(null, weeks)} className={chip(report.universityId === null)}>All</Link>
              {report.universityOptions.map((item) => <Link key={item.id} href={link(item.id, weeks)} className={chip(report.universityId === item.id)}>{item.code}</Link>)}
            </Slicer>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{report.kpis.map((kpi) => <Card key={kpi.key} kpi={kpi} />)}</div>

        <div className="grid gap-4 md:grid-cols-3">
          <Tile title="Requests accepted"><p className="text-4xl font-light tabular-nums">{percent(report.acceptance.current)}</p><p className="mt-1 text-xs text-[#605e5c]">of {report.acceptance.answered} answered requests</p><p className="mt-2"><Delta current={report.acceptance.current} previous={report.acceptance.previous} percentPoints /></p></Tile>
          <Tile title="Sessions completed"><p className="text-4xl font-light tabular-nums">{percent(report.completion.current)}</p><p className="mt-1 text-xs text-[#605e5c]">of {report.completion.ended} sessions that ended</p><p className="mt-2"><Delta current={report.completion.current} previous={report.completion.previous} percentPoints /></p></Tile>
          <Tile title="Average rating"><p className="text-4xl font-light tabular-nums">{report.rating.average === null ? "No data" : `${report.rating.average} / 5`}</p><p className="mt-1 text-xs text-[#605e5c]">{report.rating.count} {report.rating.count === 1 ? "review" : "reviews"} shown to students</p></Tile>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Tile title="People joining, by week" className="lg:col-span-2"><LineChart label="New students and new Academic Mates by week" labels={report.weeks.map((week) => week.label)} series={[{ name: "New students", values: report.weeks.map((week) => week.students), color: PBI[0] }, { name: "New Academic Mates", values: report.weeks.map((week) => week.mates), color: PBI[2] }]} /></Tile>
          <Tile title="Requests by outcome"><Donut label="Requests by outcome" centerLabel="requests" slices={report.requestMix} /></Tile>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Tile title="Tutoring activity, by week" className="lg:col-span-2"><LineChart label="Requests made and sessions completed by week" labels={report.weeks.map((week) => week.label)} series={[{ name: "Requests made", values: report.weeks.map((week) => week.requests), color: PBI[3] }, { name: "Sessions completed", values: report.weeks.map((week) => week.completed), color: PBI[1] }]} /></Tile>
          <Tile title="Sessions by status"><Donut label="Sessions by status" centerLabel="sessions" slices={report.sessionMix} /></Tile>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Tile title="Ratings given"><Columns label="Number of reviews for each star rating" items={report.rating.distribution.map((value, index) => ({ label: `${index + 1} star${index === 0 ? "" : "s"}`, value }))} color={PBI[3]} /></Tile>
          <Tile title="Most requested courses" className="lg:col-span-2">{report.topCourses.length === 0 ? <p className="text-sm text-[#605e5c]">No requests in this period.</p> : <HBars items={report.topCourses.map((course) => ({ label: course.course, sub: course.name, value: course.requests }))} />}</Tile>
        </div>

        <Tile title="By university">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead><tr className="border-b border-[#c8c6c4] text-xs text-[#605e5c]"><th className="py-2 pr-4 font-semibold">University</th><th className="px-4 py-2 text-right font-semibold">Students</th><th className="px-4 py-2 text-right font-semibold">Academic Mates</th><th className="py-2 pl-4 text-right font-semibold">Requests in period</th></tr></thead>
              <tbody>{report.byUniversity.map((row) => <tr key={row.code} className="border-b border-[#edebe9]"><td className="py-2 pr-4"><span className="font-semibold">{row.code}</span> <span className="break-words text-[#605e5c]">{row.name}</span></td><td className="px-4 py-2 text-right tabular-nums">{row.students}</td><td className="px-4 py-2 text-right tabular-nums">{row.mates}</td><td className="py-2 pl-4 text-right tabular-nums">{row.requests}</td></tr>)}</tbody>
            </table>
          </div>
        </Tile>
      </div>
    </AdminPage>
  );
}
