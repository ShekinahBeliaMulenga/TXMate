import AdminPage from "@/components/admin/admin-page";
import AuditViewer from "@/components/admin/audit-viewer";
import { requireAdminPage } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requireAdminPage("audit:view");
  return (
    <AdminPage title="Audit log" description="A permanent record of what admins did, who did it and when. Entries can’t be edited or removed.">
      <AuditViewer />
    </AdminPage>
  );
}
