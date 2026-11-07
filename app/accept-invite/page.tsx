"use client";

import { Suspense } from "react";
import ResetPasswordForm from "@/components/auth/reset-password-form";

export default function AcceptInvitePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#faf9f6] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-xl font-bold tracking-tight text-[#4d0014]">TXMate</div>
        <Suspense fallback={null}>
          <ResetPasswordForm variant="invite" />
        </Suspense>
      </div>
    </main>
  );
}
