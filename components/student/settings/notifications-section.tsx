"use client";

import { useEffect, useState } from "react";
import { disableFirebasePush, enableAndSaveFirebasePush, getExistingFirebasePushToken } from "@/lib/firebase-client";
import { InfoNote, Panel, Toggle } from "./settings-ui";

/**
 * Browser push notifications for this device. Self-contained: it reads this browser's current
 * registration on mount and enables or disables it on toggle.
 */
export default function NotificationsSection() {
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getExistingFirebasePushToken();
        if (!active || !token) return;
        const response = await fetch(`/api/push/subscribe?token=${encodeURIComponent(token)}`, { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
        const result = (await response.json().catch(() => null)) as { enabled?: boolean } | null;
        if (active && response.ok) setEnabled(result?.enabled === true);
      } catch {
        if (active) setEnabled(false);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function toggle(next: boolean) {
    if (busy || checking || next === enabled) return;
    setBusy(true);
    setError(null);
    try {
      if (next) await enableAndSaveFirebasePush();
      else await disableFirebasePush();
      setEnabled(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${next ? "enable" : "disable"} notifications.`);
    } finally {
      setBusy(false);
    }
  }

  const status = checking ? "Checking this browser…" : busy ? "Updating notification settings…" : enabled ? "Enabled for this browser." : "Disabled for this browser.";

  return (
    <div className="space-y-4">
      <Panel>
        <Toggle checked={enabled} onChange={(value) => void toggle(value)} disabled={busy || checking} label="Push notifications" description={status} />
      </Panel>
      {error ? <p role="alert" className="text-sm leading-5 text-[#7d1f2a]">{error}</p> : null}
      {enabled ? <p role="status" className="text-sm leading-5 text-[#28633b]">Push notifications are enabled on this browser. Turning this off removes this browser’s registration.</p> : null}
      <InfoNote>Notifications are set per browser. Turn this on in each browser or device where you want session reminders, messages and request updates.</InfoNote>
    </div>
  );
}
