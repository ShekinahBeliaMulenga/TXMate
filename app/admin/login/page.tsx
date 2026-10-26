import { redirect } from "next/navigation";
import AdminLoginForm from "@/components/admin/admin-login-form";
import { resolveAdmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  // Already signed in as an admin: skip the form.
  const resolved = await resolveAdmin();
  if (resolved.status === "ok") redirect("/admin");

  const { expired } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f1ed] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="text-3xl font-extrabold tracking-tight">
            <span className="text-[#7d1f2a]">TX</span>
            <span className="text-[#282321]">Mate</span>
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#7a6f6a]">Administration</p>
        </div>
        <div className="mt-6 rounded-2xl border border-[#e2d9d0] bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-[#282321]">Admin sign in</h1>
          <p className="mt-1 text-sm text-[#6d6260]">Authorised TXMate staff only. Sign-ins are recorded.</p>
          <div className="mt-5">
            <AdminLoginForm expired={expired === "1"} />
          </div>
        </div>
      </div>
    </main>
  );
}
