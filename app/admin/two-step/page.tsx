import { notFound, redirect } from "next/navigation";
import TwoStepForm from "@/components/admin/two-step-form";
import { resolveAdmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

/** The second step of admin sign-in: first-time setup, or the code from the authenticator app. */
export default async function AdminTwoStepPage() {
  const resolved = await resolveAdmin();
  if (resolved.status === "anonymous") redirect("/admin/login");
  if (resolved.status === "expired") redirect("/admin/login?expired=1");
  if (resolved.status === "not-admin") notFound();
  if (resolved.status === "ok") redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f1ed] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center">
          <p className="text-3xl font-extrabold tracking-tight">
            <span className="text-[#7d1f2a]">TX</span>
            <span className="text-[#282321]">Mate</span>
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#7a6f6a]">Administration</p>
        </div>
        <div className="mt-6 rounded-2xl border border-[#e2d9d0] bg-white p-6 shadow-sm">
          <TwoStepForm mode={resolved.mode} email={resolved.admin.email} />
        </div>
      </div>
    </main>
  );
}
