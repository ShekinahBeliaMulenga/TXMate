import AdminPage from "@/components/admin/admin-page";
import UsersDirectory from "@/components/admin/users-directory";
import { requireAdminPage } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdminPage("users:view");
  return (
    <AdminPage title="Users" description="Find students and Academic Mates, check their status, and suspend or reactivate accounts.">
      <UsersDirectory />
    </AdminPage>
  );
}
