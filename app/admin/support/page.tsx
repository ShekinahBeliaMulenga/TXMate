import AdminPage from "@/components/admin/admin-page";
import SupportCases from "@/components/admin/support-cases";
import { requireAdminPage } from "@/lib/admin/guard";
import { isPlatformWide } from "@/lib/admin/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const admin = await requireAdminPage("support:manage");
  const universities = await prisma.university.findMany({
    where: isPlatformWide(admin.scope) ? {} : { id: { in: [...admin.universityIds] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <AdminPage title="Support cases" description="Track a problem from the first report to a recorded decision. Take a case so others know it is being handled, add notes as you go, and write down the outcome when it is resolved.">
      <SupportCases universities={universities} platform={isPlatformWide(admin.scope)} />
    </AdminPage>
  );
}
