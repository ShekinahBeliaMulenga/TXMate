import AdminPage from "@/components/admin/admin-page";
import ConsoleTerminal from "@/components/admin/console-terminal";
import { Kbd } from "@/components/admin/admin-ui";
import { CONSOLE_COMMANDS } from "@/lib/admin/console-parse";
import { requireAdminPage } from "@/lib/admin/guard";
import { ADMIN_ROLE_LABEL, roleHasPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

export default async function AdminConsolePage() {
  const admin = await requireAdminPage("dashboard:view");
  const commands = CONSOLE_COMMANDS.filter((command) => roleHasPermission(admin.role, command.permission)).map((command) => ({ name: command.name, usage: command.usage }));
  return (
    <AdminPage
      title="Console"
      description="Type a short command to look things up or act on them. Type ? to list what your role can run."
      actions={<span className="hidden text-[13px] text-[#6b635d] sm:inline">Press <Kbd>`</Kbd> anywhere in the admin portal to open this</span>}
    >
      <ConsoleTerminal commands={commands} identity={{ name: admin.name, role: ADMIN_ROLE_LABEL[admin.role] }} />
    </AdminPage>
  );
}
