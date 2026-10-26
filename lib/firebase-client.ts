"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported, onMessage, type MessagePayload, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const TOKEN_STORAGE_KEY = "txmate-fcm-token";
let foregroundListenerAttached = false;

function getFirebaseApp() {
  for (const key of ["apiKey", "projectId", "messagingSenderId", "appId"] as const) {
    if (!firebaseConfig[key]) throw new Error(`Missing Firebase configuration: ${key}`);
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

function showForegroundNotification(payload: MessagePayload) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const title = payload.notification?.title || payload.data?.title || "TXMate";
  const body = payload.notification?.body || payload.data?.body || "You have a new notification.";
  const targetUrl = typeof payload.data?.url === "string" ? payload.data.url : "/";
  void navigator.serviceWorker.ready
    .then((registration) => registration.showNotification(title, {
      body,
      icon: "/icons/icon-192x192.png",
      data: { url: targetUrl },
    }))
    .catch((error: unknown) => console.error("[push] Unable to display foreground notification:", error));
}

async function waitForWorkerActivation(worker: ServiceWorker): Promise<void> {
  if (worker.state === "activated") return;
  if (worker.state === "redundant") {
    throw new Error("TXMate notification service worker failed to activate. Reload the page and try again.");
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.removeEventListener("statechange", onStateChange);
      reject(new Error("TXMate notification service worker did not activate. Reload the page and try again."));
    }, 15000);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      worker.removeEventListener("statechange", onStateChange);
      if (error) reject(error);
      else resolve();
    };
    const onStateChange = () => {
      if (worker.state === "activated") finish();
      else if (worker.state === "redundant") {
        finish(new Error("TXMate notification service worker failed to activate. Reload the page and try again."));
      }
    };
    worker.addEventListener("statechange", onStateChange);
    onStateChange();
  });
}

async function getBrowserMessaging(): Promise<{ messaging: Messaging; vapidKey: string; registration: ServiceWorkerRegistration }> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !(await isSupported())) {
    throw new Error("Push notifications are not supported in this browser.");
  }
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error("Firebase VAPID public key is missing.");

  const scriptUrl = new URL("/firebase-messaging-sw.js", window.location.origin).href;
  let registration = await navigator.serviceWorker.getRegistration("/");
  const currentWorker = registration?.active ?? registration?.waiting ?? registration?.installing;
  if (!registration || currentWorker?.scriptURL !== scriptUrl) {
    registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { updateViaCache: "none" });
  }
  const pendingWorker = registration.installing ?? registration.waiting;
  if (pendingWorker) await waitForWorkerActivation(pendingWorker);

  const activeRegistration = await navigator.serviceWorker.ready;
  if (activeRegistration.active?.state !== "activated") {
    throw new Error("TXMate notification service worker is not active. Reload the page and try again.");
  }
  const messaging = getMessaging(getFirebaseApp());
  if (!foregroundListenerAttached) {
    onMessage(messaging, showForegroundNotification);
    foregroundListenerAttached = true;
  }
  return { messaging, vapidKey, registration: activeRegistration };
}

function getPushErrorDetails(error: unknown) {
  const value = error as { name?: string; code?: string; message?: string } | null;
  return { name: value?.name ?? "", code: value?.code ?? "", message: value?.message ?? "Unknown Firebase error" };
}

function isPushServiceError(error: unknown): boolean {
  const details = getPushErrorDetails(error);
  return details.name === "AbortError" || /push service error|registration failed|token-subscribe-failed/i.test(`${details.code} ${details.message}`);
}

function createPushServiceError(error: unknown): Error {
  const details = getPushErrorDetails(error);
  console.error("[push] Firebase token registration failed:", details);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new Error("You appear to be offline. Reconnect and try again.");
  }
  return new Error("Your browser couldn't reach its push service. Check your connection, turn off any VPN or ad blocker for this site, and in Brave enable \"Use Google services for push messaging\". Then try again.");
}

async function getFirebaseToken(messaging: Messaging, vapidKey: string, registration: ServiceWorkerRegistration): Promise<string> {
  try {
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) throw new Error("Firebase did not return a push registration token. Try again.");
    return token;
  } catch (error) {
    if (isPushServiceError(error)) throw createPushServiceError(error);
    console.error("[push] Firebase token retrieval failed:", error);
    throw error instanceof Error ? error : new Error("Unable to register this browser for push notifications.");
  }
}

export async function initializeForegroundFirebasePushListener(): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  await getBrowserMessaging();
}

export async function getExistingFirebasePushToken(): Promise<string | null> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return null;
  const { messaging, vapidKey, registration } = await getBrowserMessaging();
  return getFirebaseToken(messaging, vapidKey, registration);
}

export async function enableAndSaveFirebasePush(): Promise<void> {
  const { messaging, vapidKey, registration } = await getBrowserMessaging();
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");
  const token = await getFirebaseToken(messaging, vapidKey, registration);
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ token }),
  });
  const result = await response.json().catch(() => null) as { error?: string; success?: boolean } | null;
  if (!response.ok || !result?.success) throw new Error(result?.error || "Failed to register for notifications.");
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Server registration remains authoritative.
  }
}

export async function disableFirebasePush(): Promise<void> {
  let token: string | null = null;
  try {
    token = await getExistingFirebasePushToken();
  } catch {
    // Use the cached token if the browser push service is unavailable.
  }
  if (!token) {
    try {
      token = localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      // Browser storage may be unavailable.
    }
  }
  if (!token) return;

  const response = await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ token }),
  });
  const result = await response.json().catch(() => null) as { error?: string; success?: boolean } | null;
  if (!response.ok || !result?.success) throw new Error(result?.error || "Failed to disable notifications.");
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Server registration has already been removed.
  }
  try {
    const { messaging } = await getBrowserMessaging();
    await deleteToken(messaging);
  } catch (error) {
    console.error("[push] Server registration removed; local token cleanup failed:", error);
  }
}