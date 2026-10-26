import Link from "next/link";
import AdminPage from "@/components/admin/admin-page";
import AdminShell from "@/components/admin/admin-shell";
import { Card, EmptyState } from "@/components/admin/admin-ui";
import StatCard from "@/components/admin/stat-card";
import { Icon, type IconName } from "@/components/ui/icon";
import { AUDIT_ACTION_LABEL } from "@/lib/admin/audit-types";
import { requireAdminPage } from "@/lib/admin/guard";
import { getNavBadges } from "@/lib/admin/nav-badges";
import { isPlatformWide, roleHasPermission, universityScopeFilter, type AdminPermission } from "@/lib/admin/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Shortcut = { href: string; label: string; hint: string; icon: IconName; permission: AdminPermission };
const SHORTCUTS: Shortcut[] = [
  { href: "/admin/academic-mates", label: "Verify Academic Mates", hint: "Review documents and approve profiles", icon: "shield", permission: "verification:review" },
  { href: "/admin/disputes", label: "Review sessions", hint: "Decide sessions where answers differ", icon: "alert", permission: "disputes:view" },
  { href: "/admin/users", label: "Find a user", hint: "Search students and mates, manage status", icon: "users", permission: "users:view" },
  { href: "/admin/audit", label: "Audit log", hint: "See what admins have done", icon: "audit", permission: "audit:view" },
];

export default async function AdminDashboardPage() {
  const admin = await requireAdminPage();
  const can = (permission: AdminPermission) => roleHasPermission(admin.role, permission);
  const scope = universityScopeFilter(admin.scope);

  // Only run the queries this role may see, all at once.
  const [badges, verifiedMates, activeStudents, suspended, recent] = await Promise.all([
    getNavBadges(admin),
    prisma.academicMateProfile.count({ where: { verificationStatus: "VERIFIED", status: "ACTIVE", ...scope } }),
    prisma.studentProfile.count({ where: { status: "ACTIVE", ...scope } }),
    can("users:view") ? prisma.studentProfile.count({ where: { status: "SUSPENDED", ...scope } }) : null,
    can("audit:view")
      ? prisma.adminAuditLog.findMany({
          where: isPlatformWide(admin.scope) ? {} : { universityId: { in: admin.universityIds } },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { id: true, actorName: true, action: true, summary: true, createdAt: true },
        })
      : null,
  ]);

  const pendingVerifications = can("verification:review") ? badges.verification : null;
  const openDisputes = can("disputes:view") ? badges.disputes : null;
  const shortcuts = SHORTCUTS.filter((item) => can(item.permission));
  const first = admin.name.trim().split(/\s+/)[0] || "there";
  const waiting = (pendingVerifications ?? 0) + (openDisputes ?? 0);

  return (
    <AdminShell admin={admin} badges={badges}>
      <AdminPage
        title={`Welcome, ${first}`}
        description={waiting > 0 ? `${waiting} ${waiting === 1 ? "item needs" : "items need"} attention across ${isPlatformWide(admin.scope) ? "all universities" : "your universities"}.` : `Nothing is waiting. Everything is up to date across ${isPlatformWide(admin.scope) ? "all universities" : "your universities"}.`}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {pendingVerifications !== null ? <StatCard label="Pending verifications" value={pendingVerifications} icon="shield" href="/admin/academic-mates" attention={pendingVerifications > 0} /> : null}
          {openDisputes !== null ? <StatCard label="Sessions needing review" value={openDisputes} icon="alert" href="/admin/disputes" attention={openDisputes > 0} /> : null}
          <StatCard label="Verified Academic Mates" value={verifiedMates} icon="graduation" />
          <StatCard label="Active students" value={activeStudents} icon="user" />
        </div>
        {suspended !== null && suspended > 0 ? (
          <p className="mt-3 text-[13px] text-[#6d6260]">{suspended} suspended {suspended === 1 ? "student" : "students"}. <Link href="/admin/users" className="font-semibold text-[#7d1f2a] hover:underline">View users</Link></p>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title="Quick actions">
            <ul className="divide-y divide-[#f0e9e2]">
              {shortcuts.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[#faf7f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7d1f2a]/40">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f6e7e9] text-[#7d1f2a]"><Icon name={item.icon} className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#282321]">{item.label}</span>
                      <span className="block truncate text-[13px] text-[#6d6260]">{item.hint}</span>
                    </span>
                    <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-[#b3a79f]" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {recent ? (
            <Card title="Recent admin activity" action={<Link href="/admin/audit" className="text-[13px] font-semibold text-[#7d1f2a] hover:underline">View all</Link>}>
              {recent.length === 0 ? (
                <EmptyState icon="audit" title="Nothing recorded yet" />
              ) : (
                <ul className="divide-y divide-[#f0e9e2]">
                  {recent.map((entry) => (
                    <li key={entry.id} className="flex items-start justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</p>
                        <p className="mt-0.5 truncate text-[13px] text-[#6d6260]">{entry.actorName}{entry.summary ? ` · ${entry.summary}` : ""}</p>
                      </div>
                      <time dateTime={entry.createdAt.toISOString()} className="shrink-0 text-xs text-[#7a6f6a]">{WHEN.format(entry.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      </AdminPage>
    </AdminShell>
  );
}
