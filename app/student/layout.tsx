import type { ReactNode } from "react";
import InstallAppPrompt from "@/components/install-app-prompt";
import StudentAppShell from "@/components/student/student-app-shell";

export default function StudentLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <StudentAppShell>{children}</StudentAppShell>
      <InstallAppPrompt />
    </>
  );
}
