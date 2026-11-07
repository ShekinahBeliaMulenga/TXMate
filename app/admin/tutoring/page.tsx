import AdminPage from "@/components/admin/admin-page";
import TutoringDirectory from "@/components/admin/tutoring-directory";
import { requireAdminPage } from "@/lib/admin/guard";
import { roleHasPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

export default async function AdminTutoringPage() {
  const admin = await requireAdminPage("tutoring:view");
  return (
    <AdminPage title="Tutoring" description="Every request, arrangement and session in your universities. Open a row to see the full story: who said what, when, and why anything was cancelled.">
      <TutoringDirectory canReadMessages={roleHasPermission(admin.role, "messages:view")} />
    </AdminPage>
  );
}
