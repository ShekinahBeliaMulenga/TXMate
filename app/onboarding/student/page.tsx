import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import StudentOnboardingForm from "@/components/onboarding/student-onboarding-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function StudentOnboardingPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const existingProfile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (existingProfile) {
    return (
      <main className="min-h-screen bg-[#f7f4ef] px-6 py-12 text-[#2d1b1b]">
        <div className="mx-auto max-w-2xl rounded-3xl border border-[#ded6cb] bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7d1f2a]">
            TXMate
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Your academic profile is already set up.
          </h1>
          <p className="mt-3 text-[#6d6260]">
            This account already has a student profile, so onboarding does not
            need to be completed again.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-6 py-10 text-[#2d1b1b]">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7d1f2a]">
            TXMate · Academic onboarding
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Complete your student profile
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#6d6260]">
            Tell TXMate where you study and what programme you are enrolled in.
            Your normal courses will be assigned from the university curriculum.
          </p>
        </div>

        <StudentOnboardingForm
          userName={session.user.name}
        />
      </div>
    </main>
  );
}
