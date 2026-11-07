import Link from "next/link";
import { notFound } from "next/navigation";
import AnonymiseCard from "@/components/admin/anonymise-card";
import AccountStatusCard from "@/components/admin/account-status-card";
import AdminPage from "@/components/admin/admin-page";
import { Badge, EmptyState, Panel } from "@/components/admin/admin-ui";
import { AUDIT_ACTION_LABEL, auditTone } from "@/lib/admin/audit-types";
import { requireAdminPage } from "@/lib/admin/guard";
import { roleHasPermission } from "@/lib/admin/permissions";
import { getUserDetail } from "@/lib/admin/users";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdminPage("users:view");
  const { userId } = await params;
  const user = userId.length <= 100 ? await getUserDetail(admin, userId) : null;
  if (!user) notFound();
  const canChange = roleHasPermission(admin.role, "users:suspend") && user.id !== admin.userId;

  return (
    <AdminPage
      title={user.name}
      description={`${user.email} · ${user.university} · Joined ${DATE.format(new Date(user.createdAt))}`}
      width="4xl"
      crumbs={[{ label: "Users", href: "/admin/users" }, { label: user.name }]}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Panel title="Accounts" className="divide-y divide-[#eee9e3]">
          {user.student ? (
            <AccountStatusCard
              userId={user.id}
              scope="STUDENT"
              title="Student account"
              status={user.student.status}
              detail={`${user.student.studentId} · ${user.student.programme}`}
              canChange={canChange}
              suspendEffect="They are signed out everywhere and can’t sign in, book or request sessions until reactivated."
            />
          ) : null}
          {user.mate ? (
            <AccountStatusCard
              userId={user.id}
              scope="MATE"
              title="Academic Mate profile"
              status={user.mate.status}
              detail={user.mate.headline ?? `Verification: ${user.mate.verification.toLowerCase()}`}
              canChange={canChange}
              suspendEffect="The profile is hidden from students and can’t receive new requests. They can still sign in."
            />
          ) : null}
          {user.mate && roleHasPermission(admin.role, "verification:review") ? (
            <div className="p-4">
              <Link href={`/admin/academic-mates/${user.mate.profileId}`} className="text-sm font-semibold text-[#7d1f2a] hover:underline">Open verification record</Link>
            </div>
          ) : null}
          {user.anonymised ? <p className="p-4 text-[13px] text-[#6b635d]">This account has been anonymised. Its personal details are gone.</p> : roleHasPermission(admin.role, "users:anonymise") && user.id !== admin.userId ? <AnonymiseCard userId={user.id} email={user.email} name={user.name} /> : null}
        </Panel>

        <Panel title="Admin history">
          {user.history.length === 0 ? (
            <EmptyState icon="audit" title="No admin actions yet" />
          ) : (
            <ul className="divide-y divide-[#eee9e3]">
              {user.history.map((entry) => (
                <li key={entry.id} className="px-4 py-3">
                  <Badge tone={auditTone(entry.action)}>{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</Badge>
                  {entry.summary ? <p className="text-[13px] text-[#6d6260]">{entry.summary}</p> : null}
                  <p className="mt-0.5 text-xs text-[#7a6f6a]">{entry.actorName} · {WHEN.format(new Date(entry.createdAt))}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}
