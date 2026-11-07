"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { authClient } from "@/lib/auth-client";

/** Ends the session on the server (revoking it), then returns to the admin sign-in. */
export default function AdminSignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await authClient.signOut();
    } finally {
      // Leave even if the request failed: the sign-in page re-checks the session on the server.
      router.replace("/admin/login");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={busy}
      aria-label="Sign out"
      title="Sign out"
      className="flex h-10 w-10 items-center justify-center rounded-md text-[#7d1f2a] transition hover:bg-[#7d1f2a]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:opacity-60"
    >
      <Icon name="logout" className="h-5 w-5" />
    </button>
  );
}
