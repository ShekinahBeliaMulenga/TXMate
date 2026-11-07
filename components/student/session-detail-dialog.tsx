"use client";

import { useCallback, useEffect, useState } from "react";
import SessionLifecyclePanel from "./session-lifecycle-panel";
import Sheet from "./sheet";
import type { SessionLifecycleApiResponse, SessionLifecycleItem } from "@/lib/session-lifecycle-types";

/** A session's details and workflow as a pop-up over the Sessions list. */
export default function SessionDetailDialog({ sessionId, onClose, onChanged }: { sessionId: string; onClose: () => void; onChanged?: () => void | Promise<void> }) {
  const [session, setSession] = useState<SessionLifecycleItem | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/student/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store", signal });
      const body = await response.json() as SessionLifecycleApiResponse;
      if (!response.ok || !body.session) throw new Error(response.status === 404 || response.status === 403 ? "This session isn't available to you." : body.error || "We couldn't load this session.");
      setSession(body.session); setError("");
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "We couldn't load this session.");
    }
  }, [sessionId]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  return (
    <Sheet label="Session details" onClose={onClose}>
      <div className="p-2 sm:p-3">
        {session ? (
          <SessionLifecyclePanel session={session} full onUpdated={async (updated) => { if (updated) setSession(updated); else await load(); await onChanged?.(); }} />
        ) : error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 pr-11 text-sm text-red-800">
            {error} <button type="button" onClick={() => void load()} className="font-semibold underline">Try again</button>
          </div>
        ) : (
          <div role="status" aria-busy="true" className="h-48 animate-pulse rounded-xl bg-white ring-1 ring-[#e8e0d9] motion-reduce:animate-none"><span className="sr-only">Loading session…</span></div>
        )}
      </div>
    </Sheet>
  );
}
