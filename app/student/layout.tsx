import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import InstallAppPrompt from "@/components/install-app-prompt";
import StudentAppShell from "@/components/student/student-app-shell";
import { auth } from "@/lib/auth";

export default async function StudentLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Someone who is signed out goes to the sign-in page instead of an app shell full of failed requests.
  // The API routes still check the session themselves; this only decides what a signed-out visitor sees.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/login");

  return (
    <>
      <StudentAppShell>{children}</StudentAppShell>
      <InstallAppPrompt />
    </>
  );
}
