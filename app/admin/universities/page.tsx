import AdminPage from "@/components/admin/admin-page";
import UniversitiesManager from "@/components/admin/universities-manager";
import { requireAdminPage } from "@/lib/admin/guard";
import { listUniversities } from "@/lib/admin/universities";

export const dynamic = "force-dynamic";

export default async function AdminUniversitiesPage() {
  await requireAdminPage("universities:manage");
  const universities = await listUniversities();
  return (
    <AdminPage title="Universities" description="Add universities and set their student ID and email rules. Give each university’s admins access from the Admins page.">
      <UniversitiesManager universities={universities} />
    </AdminPage>
  );
}
