/** One fetch helper for the admin forms: JSON in, readable message out, expired sessions sent to sign-in. */
export type ApiResult<T = unknown> = { ok: boolean; message: string; data: T | null };

export async function sendJson<T = unknown>(url: string, method: "POST" | "PATCH", body: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    if (response.status === 401) {
      window.location.assign("/admin/login?expired=1");
      return { ok: false, message: "Your session expired.", data: null };
    }
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    return { ok: response.ok, message: (response.ok ? data.message : data.error) || (response.ok ? "Saved." : "Something went wrong."), data: response.ok ? (data as T) : null };
  } catch {
    return { ok: false, message: "Network problem. Check your connection and try again.", data: null };
  }
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  if (response.status === 401) {
    window.location.assign("/admin/login?expired=1");
    throw new Error("Your session expired.");
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Unable to load this list.");
  return body;
}
