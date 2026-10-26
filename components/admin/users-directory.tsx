"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { ACCOUNT_STATUS_LABEL, type UserPage, type UserRoleFilter, type UserRow, type UserStatusFilter } from "@/lib/admin/user-types";
import { Badge, Card, EmptyState } from "./admin-ui";

const ROLES: ReadonlyArray<{ id: UserRoleFilter; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "students", label: "Students" },
  { id: "mates", label: "Academic Mates" },
];
const STATUSES: ReadonlyArray<{ id: UserStatusFilter; label: string }> = [
  { id: "all", label: "Any status" },
  { id: "suspended", label: "Suspended" },
];

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40";

async function fetchUsers(params: URLSearchParams, signal: AbortSignal): Promise<UserPage> {
  const response = await fetch(`/api/admin/users?${params.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  if (response.status === 401) {
    window.location.assign("/admin/login?expired=1");
    return { items: [], nextCursor: null };
  }
  const body = (await response.json().catch(() => ({}))) as Partial<UserPage> & { error?: string };
  if (!response.ok || !Array.isArray(body.items)) throw new Error(body.error || "Unable to load users.");
  return { items: body.items, nextCursor: body.nextCursor ?? null };
}

function tone(status: string) {
  return status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "danger" : "neutral";
}

function Row({ user }: { user: UserRow }) {
  return (
    <li>
      <Link href={`/admin/users/${user.id}`} className={`flex items-center gap-3 px-4 py-3 transition hover:bg-[#faf7f4] ${FOCUS}`}>
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2e9e4] text-sm font-bold text-[#7d1f2a]">{user.name.trim().charAt(0).toUpperCase() || "?"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#282321]">{user.name}</p>
          <p className="truncate text-[13px] text-[#6d6260]">{user.email} · {user.university}{user.student ? ` · ${user.student.studentId}` : ""}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {user.student ? <Badge tone={tone(user.student.status)}>Student · {ACCOUNT_STATUS_LABEL[user.student.status] ?? user.student.status}</Badge> : null}
          {user.mate ? <Badge tone={tone(user.mate.status)}>Mate · {ACCOUNT_STATUS_LABEL[user.mate.status] ?? user.mate.status}</Badge> : null}
        </div>
        <Icon name="chevronRight" className="hidden h-4 w-4 shrink-0 text-[#b3a79f] sm:block" />
      </Link>
    </li>
  );
}

export default function UsersDirectory() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<UserRoleFilter>("all");
  const [status, setStatus] = useState<UserStatusFilter>("all");
  const [items, setItems] = useState<UserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce typing so every keystroke is not a database query.
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);
    fetchUsers(new URLSearchParams({ q, role, status }), controller.signal)
      .then((page) => { setItems(page.items); setNextCursor(page.nextCursor); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setItems([]);
        setNextCursor(null);
        setError(err instanceof Error ? err.message : "Unable to load users.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [q, role, status]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchUsers(new URLSearchParams({ q, role, status, cursor: nextCursor }), new AbortController().signal);
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  const chip = (active: boolean) => `h-9 rounded-full px-3.5 text-[13px] font-semibold transition ${FOCUS} ${active ? "bg-[#7d1f2a] text-white" : "bg-white text-[#5f5652] ring-1 ring-[#e2d9d0] hover:bg-[#f6f1ec]"}`;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9a8e86]" />
        <input
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Search by name, email or student ID"
          aria-label="Search users"
          maxLength={100}
          className={`h-11 w-full rounded-xl border border-[#e2d9d0] bg-white pl-11 pr-3 text-sm ${FOCUS}`}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {ROLES.map((entry) => <button key={entry.id} type="button" onClick={() => setRole(entry.id)} aria-pressed={role === entry.id} className={chip(role === entry.id)}>{entry.label}</button>)}
        <span aria-hidden="true" className="mx-1 hidden w-px bg-[#e2d9d0] sm:block" />
        {STATUSES.map((entry) => <button key={entry.id} type="button" onClick={() => setStatus(entry.id)} aria-pressed={status === entry.id} className={chip(status === entry.id)}>{entry.label}</button>)}
      </div>

      <Card>
        {loading ? (
          <div className="space-y-px" aria-busy="true">{[0, 1, 2, 3, 4].map((n) => <div key={n} className="h-[4.25rem] animate-pulse bg-[#f6f1ec]/70" />)}</div>
        ) : error ? (
          <div role="alert" className="p-6 text-center text-sm text-[#a3262a]">{error}</div>
        ) : items.length === 0 ? (
          <EmptyState icon="users" title="No users found" hint="Try a different search or clear the filters." />
        ) : (
          <ul className="divide-y divide-[#f0e9e2]">{items.map((user) => <Row key={user.id} user={user} />)}</ul>
        )}
      </Card>

      {nextCursor && !loading ? (
        <div className="flex justify-center">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={`h-10 rounded-xl border border-[#e2d9d0] bg-white px-5 text-sm font-semibold text-[#4e4742] hover:bg-[#f6f1ec] disabled:opacity-60 ${FOCUS}`}>
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
