"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ACCOUNT_STATUS_LABEL, type UserPage, type UserRoleFilter, type UserRow, type UserStatusFilter } from "@/lib/admin/user-types";
import { DateRangeFields, SearchField, SelectField, Toolbar, GhostButton } from "./admin-controls";
import { Badge, EmptyState, Panel, TABLE } from "./admin-ui";

const ROLES: ReadonlyArray<{ id: UserRoleFilter; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "students", label: "Students" },
  { id: "mates", label: "Academic Mates" },
];
const STATUSES: ReadonlyArray<{ id: UserStatusFilter; label: string }> = [
  { id: "all", label: "Any status" },
  { id: "suspended", label: "Suspended" },
];


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

export default function UsersDirectory() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<UserRoleFilter>("all");
  const [status, setStatus] = useState<UserStatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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
    fetchUsers(new URLSearchParams({ q, role, status, from, to }), controller.signal)
      .then((page) => { setItems(page.items); setNextCursor(page.nextCursor); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setItems([]);
        setNextCursor(null);
        setError(err instanceof Error ? err.message : "Unable to load users.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [q, role, status, from, to]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchUsers(new URLSearchParams({ q, role, status, from, to, cursor: nextCursor }), new AbortController().signal);
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <Toolbar>
        <SearchField value={input} onChange={setInput} placeholder="Search name, email or student ID" label="Search users" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <SelectField label="Show" value={role} onChange={setRole} options={ROLES} />
          <SelectField label="Status" value={status} onChange={setStatus} options={STATUSES} />
        </div>
        <DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} fromLabel="Joined from" toLabel="Joined to" />
      </Toolbar>

      <Panel>
        {loading ? (
          <div aria-busy="true">{[0, 1, 2, 3, 4].map((n) => <div key={n} className="h-14 animate-pulse border-b border-[#eee9e3] bg-[#faf9f7]" />)}</div>
        ) : error ? (
          <div role="alert" className="p-6 text-center text-sm text-[#a3262a]">{error}</div>
        ) : items.length === 0 ? (
          <EmptyState icon="users" title="No users found" hint="Try a different search or clear the filters." />
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead>
                <tr>
                  <th className={TABLE.th}>Person</th>
                  <th className={`${TABLE.th} ${TABLE.hide}`}>University</th>
                  <th className={`${TABLE.th} ${TABLE.hideSm}`}>Student ID</th>
                  <th className={TABLE.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((user) => (
                  <tr key={user.id} className={TABLE.row}>
                    <td className={TABLE.td}>
                      <Link href={`/admin/users/${user.id}`} className="font-medium hover:text-[#7d1f2a] hover:underline">{user.name}</Link>
                      <p className="mt-0.5 break-words text-[13px] text-[#6b635d]">{user.email}</p>
                      <p className="mt-0.5 text-[13px] text-[#6b635d] md:hidden">{user.university}{user.student ? ` · ${user.student.studentId}` : ""}</p>
                    </td>
                    <td className={`${TABLE.td} ${TABLE.hide} text-[#4e4742]`}>{user.university}</td>
                    <td className={`${TABLE.td} ${TABLE.hideSm} font-mono text-[13px] text-[#4e4742]`}>{user.student?.studentId ?? "—"}</td>
                    <td className={TABLE.td}>
                      <div className="flex flex-col gap-1">
                        {user.student ? <Badge tone={tone(user.student.status)}>Student · {ACCOUNT_STATUS_LABEL[user.student.status] ?? user.student.status}</Badge> : null}
                        {user.mate ? <Badge tone={tone(user.mate.status)}>Mate · {ACCOUNT_STATUS_LABEL[user.mate.status] ?? user.mate.status}</Badge> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {nextCursor && !loading ? (
        <div className="flex justify-center"><GhostButton onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Show more"}</GhostButton></div>
      ) : null}
    </div>
  );
}
