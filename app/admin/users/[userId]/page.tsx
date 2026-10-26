import Link from "next/link";
import { notFound } from "next/navigation";
import AccountStatusCard from "@/components/admin/account-status-card";
import AdminPage from "@/components/admin/admin-page";
import { Card, EmptyState } from "@/components/admin/admin-ui";
import { Icon } from "@/components/ui/icon";
import { AUDIT_ACTION_LABEL } from "@/lib/admin/audit-types";
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
      actions={
        <Link href="/admin/users" aria-label="Back to users" title="Back to users" className="flex h-10 w-10 items-center justify-center rounded-full text-[#7d1f2a] hover:bg-[#7d1f2a]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">
          <Icon name="chevronLeft" className="h-6 w-6" />
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card title="Accounts" className="divide-y divide-[#f0e9e2]">
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
        </Card>

        <Card title="Admin history">
          {user.history.length === 0 ? (
            <EmptyState icon="audit" title="No admin actions yet" />
          ) : (
            <ul className="divide-y divide-[#f0e9e2]">
              {user.history.map((entry) => (
                <li key={entry.id} className="px-4 py-3">
                  <p className="text-sm font-semibold">{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</p>
                  {entry.summary ? <p className="text-[13px] text-[#6d6260]">{entry.summary}</p> : null}
                  <p className="mt-0.5 text-xs text-[#7a6f6a]">{entry.actorName} · {WHEN.format(new Date(entry.createdAt))}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}
