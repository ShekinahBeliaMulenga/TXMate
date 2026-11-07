import Link from "next/link";
import AdminPage from "@/components/admin/admin-page";
import AdminShell from "@/components/admin/admin-shell";
import { Badge, EmptyState, Panel, Stat, StatStrip, TABLE } from "@/components/admin/admin-ui";
import { AUDIT_ACTION_LABEL, auditTone } from "@/lib/admin/audit-types";
import { listDisputes } from "@/lib/admin/disputes";
import { requireAdminPage } from "@/lib/admin/guard";
import { getDashboardMetrics } from "@/lib/admin/ops";
import { statusLabel, type CountMap } from "@/lib/admin/ops-types";
import { getNavBadges } from "@/lib/admin/nav-badges";
import { isPlatformWide, roleHasPermission, universityScopeFilter, type AdminPermission } from "@/lib/admin/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

function ago(date: Date): string {
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function Breakdown({ title, counts }: { title: string; counts: CountMap }) {
  return (
    <div className="px-4 py-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">{title}</h3>
      <dl className="mt-2 space-y-1">
        {Object.entries(counts).map(([key, value]) => (
          <div key={key} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-[#4e4742]">{statusLabel(key)}</dt>
            <dd className="tabular-nums font-medium text-[#1f1a17]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const admin = await requireAdminPage();
  const can = (permission: AdminPermission) => roleHasPermission(admin.role, permission);
  const scope = universityScopeFilter(admin.scope);

  // Only run the queries this role may see, all at once.
  const [badges, metrics, pending, disputes, recent] = await Promise.all([
    getNavBadges(admin),
    getDashboardMetrics(admin),
    can("verification:review")
      ? prisma.academicMateProfile.findMany({
          where: { verificationStatus: "PENDING", ...scope },
          orderBy: { updatedAt: "asc" },
          take: 5,
          select: { id: true, updatedAt: true, headline: true, user: { select: { name: true } }, university: { select: { code: true } } },
        })
      : null,
    can("disputes:view") ? listDisputes(admin, "open", null, 5) : null,
    can("audit:view")
      ? prisma.adminAuditLog.findMany({
          where: isPlatformWide(admin.scope) ? {} : { universityId: { in: admin.universityIds } },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, actorName: true, action: true, summary: true, createdAt: true },
        })
      : null,
  ]);

  const pendingCount = can("verification:review") ? badges.verification : null;
  const disputeCount = can("disputes:view") ? badges.disputes : null;
  const waiting = (pendingCount ?? 0) + (disputeCount ?? 0);
  const alerts: Array<{ text: string; href: string }> = [];
  if (pendingCount) alerts.push({ text: `${pendingCount} Academic Mate ${pendingCount === 1 ? "application is" : "applications are"} waiting for verification.`, href: "/admin/academic-mates" });
  if (can("disputes:view") && metrics.outstanding.disputes > 0) alerts.push({ text: `${metrics.outstanding.disputes} ${metrics.outstanding.disputes === 1 ? "session needs" : "sessions need"} a decision.`, href: "/admin/disputes" });
  if (can("tutoring:view") && metrics.outstanding.attendance > 0) alerts.push({ text: `${metrics.outstanding.attendance} ended ${metrics.outstanding.attendance === 1 ? "session has" : "sessions have"} no settled attendance.`, href: "/admin/tutoring" });
  if (can("support:manage") && badges.support > 0) alerts.push({ text: `${badges.support} support ${badges.support === 1 ? "case is" : "cases are"} open.`, href: "/admin/support" });
  if (metrics.failedDeliveries) alerts.push({ text: `${metrics.failedDeliveries} notification ${metrics.failedDeliveries === 1 ? "delivery has" : "deliveries have"} failed.`, href: "/admin/health" });
  if (metrics.integrityIssues > 0) alerts.push({ text: `${metrics.integrityIssues} data ${metrics.integrityIssues === 1 ? "check needs" : "checks need"} attention.`, href: "/admin/health" });
  const sessionsDone = metrics.sessions.COMPLETED ?? 0;
  const first = admin.name.trim().split(/\s+/)[0] || "there";
  const where = isPlatformWide(admin.scope) ? "all universities" : "your universities";

  return (
    <AdminShell admin={admin} badges={badges}>
      <AdminPage
        title={`Welcome, ${first}`}
        description={waiting > 0 ? `${waiting} ${waiting === 1 ? "item needs" : "items need"} attention across ${where}.` : `Nothing is waiting across ${where}.`}
      >
        {alerts.length > 0 ? (
          <Panel title="Needs attention" className="mb-6">
            <ul className="divide-y divide-[#eee9e3]">
              {alerts.map((alert) => (
                <li key={alert.text}>
                  <Link href={alert.href} className="flex items-start gap-3 px-4 py-3 text-sm hover:bg-[#faf8f6]">
                    <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#d99a0b]" />
                    <span className="min-w-0 break-words">{alert.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <StatStrip>
          {pendingCount !== null ? <Stat label="Pending verifications" value={pendingCount} href="/admin/academic-mates" tone={pendingCount > 0 ? "attention" : undefined} /> : null}
          {disputeCount !== null ? <Stat label="Sessions to review" value={disputeCount} href="/admin/disputes" tone={disputeCount > 0 ? "attention" : undefined} /> : null}
          <Stat label="Attendance not settled" value={metrics.outstanding.attendance} />
          <Stat label="Completion not confirmed" value={metrics.outstanding.completion} />
        </StatStrip>
        <div className="mt-4">
          <StatStrip>
            <Stat label="Students" value={metrics.users.students} />
            <Stat label="Academic Mates" value={metrics.users.mates} />
            <Stat label="Active arrangements" value={metrics.arrangementsActive} />
            <Stat label="Sessions completed" value={sessionsDone} />
            <Stat label="New students, 7 days" value={metrics.users.newStudents7d} />
            <Stat label="New mates, 7 days" value={metrics.users.newMates7d} />
            {metrics.users.admins !== null ? <Stat label="Admins" value={metrics.users.admins} /> : null}
            {metrics.adminActions24h !== null ? <Stat label="Admin actions, 24 hours" value={metrics.adminActions24h} /> : null}
          </StatStrip>
        </div>

        <div className="mt-6">
          <Panel title="Where everything stands">
            <div className="grid divide-y divide-[#eee9e3] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
              <Breakdown title="Students" counts={metrics.studentStatus} />
              <Breakdown title="Academic Mates" counts={metrics.mateStatus} />
              <Breakdown title="Mate verification" counts={metrics.verification} />
              <Breakdown title="Offerings" counts={metrics.offerings} />
              <Breakdown title="Requests" counts={metrics.requests} />
              <Breakdown title="Sessions" counts={metrics.sessions} />
            </div>
          </Panel>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            {pending ? (
              <Panel title="Awaiting verification" action={<Link href="/admin/academic-mates" className="text-[13px] font-semibold text-[#7d1f2a] hover:underline">Open queue</Link>}>
                {pending.length === 0 ? (
                  <EmptyState icon="shield" title="No pending verifications" hint="New Academic Mate applications will appear here." />
                ) : (
                  <table className={TABLE.table}>
                    <thead><tr><th className={TABLE.th}>Applicant</th><th className={`${TABLE.th} ${TABLE.hideSm}`}>University</th><th className={`${TABLE.th} text-right`}>Waiting</th></tr></thead>
                    <tbody>
                      {pending.map((row) => (
                        <tr key={row.id} className={TABLE.row}>
                          <td className={TABLE.td}>
                            <Link href={`/admin/academic-mates/${row.id}`} className="font-medium hover:text-[#7d1f2a] hover:underline">{row.user.name}</Link>
                            <p className="mt-0.5 break-words text-[13px] text-[#6b635d] sm:hidden">{row.university.code}</p>
                          </td>
                          <td className={`${TABLE.td} ${TABLE.hideSm} text-[#6b635d]`}>{row.university.code}</td>
                          <td className={`${TABLE.td} text-right tabular-nums text-[#6b635d]`}>{ago(row.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            ) : null}

            {disputes ? (
              <Panel title="Sessions to review" action={<Link href="/admin/disputes" className="text-[13px] font-semibold text-[#7d1f2a] hover:underline">Open queue</Link>}>
                {disputes.items.length === 0 ? (
                  <EmptyState icon="alert" title="Nothing needs review" hint="Sessions with mismatched answers will appear here." />
                ) : (
                  <table className={TABLE.table}>
                    <thead><tr><th className={TABLE.th}>Session</th><th className={`${TABLE.th} ${TABLE.hideSm}`}>People</th><th className={`${TABLE.th} text-right`}>Date</th></tr></thead>
                    <tbody>
                      {disputes.items.map((item) => (
                        <tr key={item.id} className={TABLE.row}>
                          <td className={TABLE.td}>
                            <Link href="/admin/disputes" className="font-medium hover:text-[#7d1f2a] hover:underline">{item.course.code}</Link>
                            <p className="mt-0.5 break-words text-[13px] text-[#6b635d] sm:hidden">{item.student.name} · {item.mate.name}</p>
                          </td>
                          <td className={`${TABLE.td} ${TABLE.hideSm} text-[#6b635d]`}>{item.student.name} · {item.mate.name}</td>
                          <td className={`${TABLE.td} whitespace-nowrap text-right tabular-nums text-[#6b635d]`}>{DAY.format(new Date(item.scheduledStart))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            ) : null}
          </div>

          {recent ? (
            <div className="lg:col-span-2">
              <Panel title="Recent activity" action={<Link href="/admin/audit" className="text-[13px] font-semibold text-[#7d1f2a] hover:underline">Audit log</Link>}>
                {recent.length === 0 ? (
                  <EmptyState icon="audit" title="Nothing recorded yet" />
                ) : (
                  <ol className="divide-y divide-[#eee9e3]">
                    {recent.map((entry) => (
                      <li key={entry.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <Badge tone={auditTone(entry.action)}>{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</Badge>
                          <time dateTime={entry.createdAt.toISOString()} className="shrink-0 text-xs tabular-nums text-[#7a716a]">{WHEN.format(entry.createdAt)}</time>
                        </div>
                        <p className="mt-1 text-[13px] leading-5 text-[#6b635d]">{entry.actorName}{entry.summary ? ` · ${entry.summary}` : ""}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            </div>
          ) : null}
        </div>
      </AdminPage>
    </AdminShell>
  );
}
