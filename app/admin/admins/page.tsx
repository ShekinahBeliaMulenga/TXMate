import AdminPage from "@/components/admin/admin-page";
import AdminsManager from "@/components/admin/admins-manager";
import { listAdmins } from "@/lib/admin/admins";
import { requireAdminPage } from "@/lib/admin/guard";
import { listUniversities } from "@/lib/admin/universities";

export const dynamic = "force-dynamic";

export default async function AdminAdminsPage() {
  const admin = await requireAdminPage("admins:manage");
  const [admins, universities] = await Promise.all([listAdmins(), listUniversities()]);
  return (
    <AdminPage title="Admins" description="Who can use this portal, what they can do, and which universities they can see.">
      <AdminsManager admins={admins} universities={universities.map(({ id, code, name }) => ({ id, code, name }))} currentUserId={admin.userId} />
    </AdminPage>
  );
}
