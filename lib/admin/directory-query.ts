import { lusakaDayStart } from "./date-range";
import { ARRANGEMENT_STATUSES, REQUEST_STATUSES, type DirectoryKind } from "./ops-types";
import { isAdminSessionState } from "./session-state";

export type DirectoryQuery = { kind: DirectoryKind; status: string; arrangement: string; q: string; from: string; to: string; page: number };
export type DirectoryQueryResult = { ok: true; query: DirectoryQuery } | { ok: false; error: string };

const ANY = new Set(["", "all"]);
const bad = (error: string): DirectoryQueryResult => ({ ok: false, error });

/** Checks the Tutoring list parameters. Anything that is not a real value is refused rather than silently ignored. */
export function parseDirectoryQuery(params: URLSearchParams): DirectoryQueryResult {
  const rawKind = params.get("kind") ?? "requests";
  if (rawKind !== "requests" && rawKind !== "sessions") return bad("Choose requests or sessions.");
  const kind: DirectoryKind = rawKind;

  const status = (params.get("status") ?? "all").trim();
  if (!ANY.has(status)) {
    const known = kind === "sessions"
      ? isAdminSessionState(status)
      : (REQUEST_STATUSES as readonly string[]).includes(status) || (status.startsWith("ARR_") && (ARRANGEMENT_STATUSES as readonly string[]).includes(status.slice(4)));
    if (!known) return bad("That status is not valid for this list.");
  }

  const arrangement = (params.get("arrangement") ?? "all").trim();
  if (!ANY.has(arrangement) && !(kind === "requests" && (ARRANGEMENT_STATUSES as readonly string[]).includes(arrangement))) {
    return bad("That arrangement status is not valid.");
  }

  const from = (params.get("from") ?? "").trim();
  const to = (params.get("to") ?? "").trim();
  if (from && !lusakaDayStart(from)) return bad("The start date is not a real date (use YYYY-MM-DD).");
  if (to && !lusakaDayStart(to)) return bad("The end date is not a real date (use YYYY-MM-DD).");
  if (from && to && from > to) return bad("The start date is after the end date.");

  const rawPage = params.get("page");
  const page = rawPage === null || rawPage === "" ? 1 : /^\d{1,5}$/.test(rawPage) ? Number(rawPage) : 0;
  if (page < 1 || page > 10000) return bad("The page number is not valid.");

  return { ok: true, query: { kind, status: ANY.has(status) ? "all" : status, arrangement: kind === "requests" && !ANY.has(arrangement) ? arrangement : "", q: (params.get("q") ?? "").trim().slice(0, 100), from, to, page } };
}
