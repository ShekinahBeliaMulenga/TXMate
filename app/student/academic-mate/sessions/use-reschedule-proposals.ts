import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Proposal, ProposalsPage, ProposalsResponse } from "./types";

const ENDPOINT = "/api/student/academic-mate/reschedule-requests";
const DEFAULT_ERROR = "Unable to load rescheduling proposals.";

/** An error whose message came from the server and is safe to show. */
class ApiError extends Error {}

type Phase = "initial" | "refreshing" | "more" | "idle";
type Mode = "replace" | "append";

type State = {
  proposals: Proposal[];
  total: number;
  page: number;
  hasMore: boolean;
  phase: Phase;
  error: string | null;
};

type Action =
  | { type: "request"; phase: "refreshing" | "more" }
  | { type: "loaded"; mode: Mode; result: ProposalsPage }
  | { type: "failed"; message: string };

const INITIAL_STATE: State = {
  proposals: [],
  total: 0,
  page: 1,
  hasMore: false,
  phase: "initial",
  error: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "request":
      return { ...state, phase: action.phase, error: null };
    case "loaded":
      return {
        proposals:
          action.mode === "append" ? mergeUnique(state.proposals, action.result.proposals) : action.result.proposals,
        total: action.result.total,
        page: action.result.page,
        hasMore: action.result.hasMore,
        phase: "idle",
        error: null,
      };
    case "failed":
      return { ...state, phase: "idle", error: action.message };
  }
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === "AbortError";
}

async function parseBody(response: Response): Promise<ProposalsResponse | null> {
  try {
    return (await response.json()) as ProposalsResponse;
  } catch (cause) {
    // Non-JSON bodies (e.g. a gateway error page) are handled by the caller.
    if (cause instanceof SyntaxError) return null;
    throw cause;
  }
}

async function fetchPage(page: number, signal: AbortSignal): Promise<ProposalsPage> {
  const response = await fetch(`${ENDPOINT}?page=${page}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await parseBody(response);

  if (!response.ok) throw new ApiError(body?.error || DEFAULT_ERROR);
  if (!body) throw new ApiError(DEFAULT_ERROR);

  const proposals = Array.isArray(body.proposals) ? body.proposals : [];
  return {
    proposals,
    total: typeof body.count === "number" ? body.count : proposals.length,
    page: typeof body.page === "number" ? body.page : page,
    hasMore: Boolean(body.hasMore),
  };
}

/** Appends `incoming` to `current`, skipping ids that are already present. */
function mergeUnique(current: Proposal[], incoming: Proposal[]): Proposal[] {
  const seen = new Set(current.map((proposal) => proposal.id));
  return [...current, ...incoming.filter((proposal) => !seen.has(proposal.id))];
}

export function useRescheduleProposals() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const { page } = state;

  // Only the most recent request is allowed to update state.
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async (targetPage: number, mode: Mode) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const result = await fetchPage(targetPage, controller.signal);
      if (controller.signal.aborted) return;
      dispatch({ type: "loaded", mode, result });
    } catch (cause) {
      if (isAbortError(cause) || controller.signal.aborted) return;
      dispatch({ type: "failed", message: cause instanceof ApiError ? cause.message : DEFAULT_ERROR });
    }
  }, []);

  useEffect(() => {
    void load(1, "replace");
    return () => controllerRef.current?.abort();
  }, [load]);

  const refresh = useCallback(() => {
    dispatch({ type: "request", phase: "refreshing" });
    void load(1, "replace");
  }, [load]);

  const loadMore = useCallback(() => {
    dispatch({ type: "request", phase: "more" });
    void load(page + 1, "append");
  }, [load, page]);

  return { ...state, refresh, loadMore };
}
