"use client";

import { useEffect } from "react";
import { initializeForegroundFirebasePushListener } from "@/lib/firebase-client";

export default function FirebaseForegroundPushListener() {
  useEffect(() => {
    let active = true;
    void initializeForegroundFirebasePushListener().catch((error: unknown) => {
      if (active) console.error("[push] Could not initialize foreground notifications:", error);
    });
    return () => { active = false; };
  }, []);

  return null;
}
