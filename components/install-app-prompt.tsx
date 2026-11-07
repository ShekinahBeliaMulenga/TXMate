"use client";

import { useEffect, useState } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<InstallChoice> };

const DISMISSED_KEY = "txmate-install-dismissed-at";
const SNOOZE_MS = 30 * 24 * 3600 * 1000;

function recentlyDismissed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

function isInstalled(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

/** iPhones and iPads cannot show an install button; installing there is Share, then Add to Home Screen. */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

/**
 * A small dismissible card offering to install TXMate. It only appears when the browser says the app can be
 * installed (or on iPhone Safari, with the steps), never when TXMate already runs as an installed app.
 */
export default function InstallAppPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isInstalled() || recentlyDismissed()) return;
    const onPrompt = (raw: Event) => {
      raw.preventDefault();
      setEvent(raw as InstallPromptEvent);
    };
    const onInstalled = () => { setEvent(null); setIos(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isIosSafari()) setIos(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try { window.localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* Shown again next visit. */ }
    setEvent(null);
    setIos(false);
  }

  async function install() {
    if (!event) return;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "dismissed") dismiss();
    } catch { /* The browser declined; the card stays so the person can try again. */ }
    setEvent(null);
  }

  if (!event && !ios) return null;
  return (
    <aside role="region" aria-label="Install TXMate" className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-sm rounded-2xl border border-[#e9e1db] bg-white p-4 shadow-[0_12px_40px_rgba(40,25,20,0.18)] lg:bottom-5 lg:left-auto lg:right-5 lg:mx-0">
      <p className="text-sm font-semibold text-[#282321]">Install TXMate on this device</p>
      <p className="mt-1 text-xs leading-5 text-[#756b65]">
        {event
          ? "Open TXMate from your home screen or desktop in its own window, without the browser bars."
          : "Tap the Share button in Safari, then choose Add to Home Screen."}
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={dismiss} className="h-9 rounded-lg px-3 text-xs font-medium text-[#625954] hover:bg-[#f5f0eb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">{event ? "Not now" : "Got it"}</button>
        {event && <button type="button" onClick={() => void install()} className="h-9 rounded-lg bg-[#7d1f2a] px-3.5 text-xs font-semibold text-white hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">Install app</button>}
      </div>
    </aside>
  );
}
