/**
 * Where the app lives and which browser origins it trusts. Pure functions of the environment, so they can be tested.
 * In production a missing public address is an error, so emailed links can never point at localhost.
 */
type Env = Record<string, string | undefined>;

const LOCAL_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000", "http://192.168.*.*:3000"];
const isLocal = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
/** `next build` runs with NODE_ENV=production but has no runtime settings, so it must not fail for a missing address. */
const isBuild = (env: Env) => env.NEXT_PHASE === "phase-production-build";

export function resolveAppOrigin(env: Env): string {
  const raw = (env.BETTER_AUTH_URL || env.NEXT_PUBLIC_APP_URL || "").trim();
  if (!raw) {
    if (env.NODE_ENV === "production" && !isBuild(env)) throw new Error("BETTER_AUTH_URL must be set to the public address of the app (for example https://txmate.example.com) in production.");
    return "http://localhost:3000";
  }
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`BETTER_AUTH_URL is not a valid address: ${raw}`); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("BETTER_AUTH_URL must start with http:// or https://.");
  return raw.replace(/\/+$/, "");
}

/** Extra origins from TRUSTED_ORIGINS (comma separated), for example a tunnel used for testing. Anything that is not an http(s) address is ignored. */
export function extraTrustedOrigins(env: Env): string[] {
  return (env.TRUSTED_ORIGINS ?? "").split(",").map((item) => item.trim().replace(/\/+$/, "")).filter((item) => /^https?:\/\/[^\s*]+$/.test(item));
}

export function trustedOriginsFor(env: Env): string[] {
  const origin = resolveAppOrigin(env);
  const development = env.NODE_ENV !== "production" || isLocal(origin);
  return [...new Set([...(development ? LOCAL_ORIGINS : []), origin, ...extraTrustedOrigins(env)])];
}
