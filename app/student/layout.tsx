
import type { ReactNode } from "react";
import StudentAppShell from "@/components/student/student-app-shell";

export default function StudentLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <StudentAppShell>{children}</StudentAppShell>;
}
