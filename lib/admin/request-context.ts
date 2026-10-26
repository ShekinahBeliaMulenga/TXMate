/** Who and where an admin request came from, recorded with every audit entry. Pure and testable. */
export type RequestContext = { ipAddress: string | null; userAgent: string | null };

const MAX_IP = 64;
const MAX_UA = 300;

function clean(value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Best-effort client address. Behind a proxy (ngrok, a load balancer) the first entry of
 * X-Forwarded-For is the original client. This is for the audit trail only, never for access control.
 */
export function requestContextFrom(headers: Pick<Headers, "get">): RequestContext {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0];
  return {
    ipAddress: clean(forwarded ?? headers.get("x-real-ip"), MAX_IP),
    userAgent: clean(headers.get("user-agent"), MAX_UA),
  };
}
