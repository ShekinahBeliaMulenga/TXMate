import AdminPage from "@/components/admin/admin-page";
import DisputesQueue from "@/components/admin/disputes-queue";
import { requireAdminPage } from "@/lib/admin/guard";
import { roleHasPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

export default async function AdminDisputesPage() {
  const admin = await requireAdminPage("disputes:view");
  return (
    <AdminPage title="Session reviews" description="Attendance answers that didn’t match, reported problems, and confirmations that never arrived.">
      <DisputesQueue canResolve={roleHasPermission(admin.role, "disputes:resolve")} />
    </AdminPage>
  );
}
