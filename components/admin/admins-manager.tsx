"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import type { AdminRow } from "@/lib/admin/admins";
import { ADMIN_ROLE_LABEL, type AdminRoleName } from "@/lib/admin/permissions";
import { GhostButton, PrimaryButton, SearchField, TextField } from "./admin-controls";
import { Badge, EmptyState, FOCUS, Panel, TABLE } from "./admin-ui";

type University = { id: string; code: string; name: string };
type Result = { ok: boolean; message: string } | null;

const ROLE_HELP: Record<AdminRoleName, string> = {
  PLATFORM_ADMIN: "Everything, across all universities, including admins and universities.",
  UNIVERSITY_ADMIN: "Verification, session reviews, users and audit for the chosen universities.",
  MODERATOR: "Verification and session reviews; can view users. Chosen universities only.",
  SUPPORT: "Read-only: session reviews and users. Chosen universities only.",
};
const ROLES = Object.keys(ROLE_HELP) as AdminRoleName[];

async function send(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<NonNullable<Result>> {
  try {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 401) {
      window.location.assign("/admin/login?expired=1");
      return { ok: false, message: "Your session expired." };
    }
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    return { ok: response.ok, message: (response.ok ? data.message : data.error) || (response.ok ? "Saved." : "Something went wrong.") };
  } catch {
    return { ok: false, message: "Network problem. Check your connection and try again." };
  }
}

function Notice({ result }: { result: Result }) {
  if (!result) return null;
  return <p role={result.ok ? "status" : "alert"} className={`text-[13px] ${result.ok ? "text-[#28633b]" : "text-[#a3262a]"}`}>{result.message}</p>;
}

/** Role picker plus university checklist, shared by "add" and "edit". */
function AccessFields({ role, setRole, selected, setSelected, universities }: { role: AdminRoleName; setRole: (role: AdminRoleName) => void; selected: string[]; setSelected: (ids: string[]) => void; universities: University[] }) {
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return (
    <>
      <label className="block">
        <span className="text-[13px] font-medium text-[#3a332f]">Role</span>
        <select value={role} onChange={(event) => setRole(event.target.value as AdminRoleName)} className={`mt-1 h-10 w-full rounded-md border border-[#d9d3cc] bg-white px-3 text-sm ${FOCUS}`}>
          {ROLES.map((id) => <option key={id} value={id}>{ADMIN_ROLE_LABEL[id]}</option>)}
        </select>
        <span className="mt-1 block text-xs text-[#7a716a]">{ROLE_HELP[role]}</span>
      </label>
      {role === "PLATFORM_ADMIN" ? null : (
        <fieldset>
          <legend className="text-[13px] font-medium text-[#3a332f]">Universities</legend>
          {universities.length === 0 ? (
            <p className="mt-1 text-[13px] text-[#a3262a]">Add a university first.</p>
          ) : (
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {universities.map((university) => (
                <label key={university.id} className="flex min-h-10 items-center gap-2 rounded-md border border-[#e4dfd9] bg-white px-3 text-sm">
                  <input type="checkbox" checked={selected.includes(university.id)} onChange={() => toggle(university.id)} className="h-4 w-4 accent-[#7d1f2a]" />
                  <span className="min-w-0 break-words">{university.name} <span className="font-mono text-xs text-[#7a716a]">{university.code}</span></span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}
    </>
  );
}

function InviteAdmin({ universities, onDone }: { universities: University[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRoleName>("UNIVERSITY_ADMIN");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const outcome = await send("/api/admin/admins/invite", "POST", { name, email, role, universityIds: role === "PLATFORM_ADMIN" ? [] : selected });
    setResult(outcome);
    setBusy(false);
    if (outcome.ok) onDone();
  }

  return (
    <Panel title="Invite a new admin">
      <form onSubmit={(event) => void submit(event)} className="space-y-4 p-4">
        <TextField label="Full name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required placeholder="Ayana Mulenga" />
        <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} required placeholder="name@example.com" hint="They get an email to choose their own password. No registration needed, and you never see the password." />
        <AccessFields role={role} setRole={setRole} selected={selected} setSelected={setSelected} universities={universities} />
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton type="submit" disabled={busy || !name.trim() || !email.trim() || (role !== "PLATFORM_ADMIN" && selected.length === 0)}>{busy ? "Sending…" : "Send invitation"}</PrimaryButton>
          <Notice result={result} />
        </div>
      </form>
    </Panel>
  );
}

function AddAdmin({ universities, onDone }: { universities: University[]; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRoleName>("UNIVERSITY_ADMIN");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const outcome = await send("/api/admin/admins", "POST", { email, role, universityIds: role === "PLATFORM_ADMIN" ? [] : selected });
    setResult(outcome);
    setBusy(false);
    if (outcome.ok) onDone();
  }

  return (
    <Panel title="Give an existing account admin access">
      <form onSubmit={(event) => void submit(event)} className="space-y-4 p-4">
        <TextField label="Their account email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} required placeholder="name@example.com" hint="For someone who already has a TXMate account with a verified email." />
        <AccessFields role={role} setRole={setRole} selected={selected} setSelected={setSelected} universities={universities} />
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton type="submit" disabled={busy || !email.trim() || (role !== "PLATFORM_ADMIN" && selected.length === 0)}>{busy ? "Granting…" : "Grant access"}</PrimaryButton>
          <Notice result={result} />
        </div>
      </form>
    </Panel>
  );
}

function EditAdmin({ row, universities, isSelf, onChanged }: { row: AdminRow; universities: University[]; isSelf: boolean; onChanged: () => void }) {
  const [role, setRole] = useState<AdminRoleName>(row.role);
  const [selected, setSelected] = useState<string[]>(row.universities.map((u) => u.id));
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [result, setResult] = useState<Result>(null);

  if (isSelf) return <p className="text-sm text-[#6b635d]">This is you. Ask another platform admin to change your access.</p>;

  async function resend() {
    if (busy) return;
    setBusy(true);
    setResult(await send(`/api/admin/admins/${encodeURIComponent(row.id)}/invite`, "POST"));
    setBusy(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const outcome = await send(`/api/admin/admins/${encodeURIComponent(row.id)}`, "PATCH", { role, universityIds: role === "PLATFORM_ADMIN" ? [] : selected });
    setResult(outcome);
    setBusy(false);
    if (outcome.ok) onChanged();
  }

  async function resetTwoStep() {
    if (busy) return;
    setBusy(true);
    const outcome = await send(`/api/admin/admins/${encodeURIComponent(row.id)}/two-step-reset`, "POST");
    setResult(outcome);
    setBusy(false);
    setConfirmReset(false);
    if (outcome.ok) onChanged();
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    const outcome = await send(`/api/admin/admins/${encodeURIComponent(row.id)}`, "DELETE");
    setResult(outcome);
    setBusy(false);
    if (outcome.ok) onChanged();
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-4">
      <AccessFields role={role} setRole={setRole} selected={selected} setSelected={setSelected} universities={universities} />
      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton type="submit" disabled={busy || (role !== "PLATFORM_ADMIN" && selected.length === 0)}>{busy ? "Saving…" : "Save access"}</PrimaryButton>
        {confirmRemove ? (
          <span className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="basis-full text-[#a3262a]">This takes away all admin access for this person straight away. Their normal student account is not touched. It is recorded in the audit log.</span>
            Remove admin access?
            <button type="button" onClick={() => void remove()} disabled={busy} className={`h-9 rounded-md bg-[#a3262a] px-3 font-semibold text-white disabled:opacity-60 ${FOCUS}`}>Yes, remove</button>
            <button type="button" onClick={() => setConfirmRemove(false)} className={`h-9 rounded-md px-3 font-medium text-[#4e4742] hover:bg-white ${FOCUS}`}>Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmRemove(true)} className={`h-10 rounded-md border border-[#e3b5b7] px-4 text-sm font-medium text-[#a3262a] hover:bg-[#fdf1f1] ${FOCUS}`}>Remove access</button>
        )}
        {confirmReset ? (
          <span className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="basis-full text-[#4e4742]">This signs {row.name} out everywhere and removes their authenticator and backup codes. They must set up two-step sign-in again. Only do this once you are sure it is really them asking. It is recorded in the audit log.</span>
            Reset two-step sign-in?
            <button type="button" onClick={() => void resetTwoStep()} disabled={busy} className={`h-9 rounded-md bg-[#a3262a] px-3 font-semibold text-white disabled:opacity-60 ${FOCUS}`}>Yes, reset</button>
            <button type="button" onClick={() => setConfirmReset(false)} className={`h-9 rounded-md px-3 font-medium text-[#4e4742] hover:bg-white ${FOCUS}`}>Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmReset(true)} className={`h-10 rounded-md border border-[#d9d3cc] bg-white px-4 text-sm font-medium text-[#3a332f] hover:bg-[#f1ede8] ${FOCUS}`}>Reset two-step sign-in</button>
        )}
        {row.pendingInvite ? <button type="button" onClick={() => void resend()} disabled={busy} className={`h-10 rounded-md border border-[#d9d3cc] bg-white px-4 text-sm font-medium text-[#3a332f] hover:bg-[#f1ede8] disabled:opacity-60 ${FOCUS}`}>Send invitation again</button> : null}
        <Notice result={result} />
      </div>
    </form>
  );
}

export default function AdminsManager({ admins, universities, currentUserId }: { admins: AdminRow[]; universities: University[]; currentUserId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState<"invite" | "existing" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const shown = needle ? admins.filter((row) => `${row.name} ${row.email} ${ADMIN_ROLE_LABEL[row.role]}`.toLowerCase().includes(needle)) : admins;
  const refresh = () => router.refresh();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <GhostButton onClick={() => setAdding(adding === "existing" ? null : "existing")} aria-expanded={adding === "existing"}>
          <Icon name={adding === "existing" ? "close" : "key"} className="h-4 w-4" />{adding === "existing" ? "Close" : "Give an existing account access"}
        </GhostButton>
        <GhostButton onClick={() => setAdding(adding === "invite" ? null : "invite")} aria-expanded={adding === "invite"}>
          <Icon name={adding === "invite" ? "close" : "plus"} className="h-4 w-4" />{adding === "invite" ? "Close" : "Invite new admin"}
        </GhostButton>
      </div>
      {adding === "invite" ? <InviteAdmin universities={universities} onDone={() => { setAdding(null); refresh(); }} /> : null}
      {adding === "existing" ? <AddAdmin universities={universities} onDone={() => { setAdding(null); refresh(); }} /> : null}

      <SearchField value={search} onChange={setSearch} placeholder="Search admin name, email or role" label="Search admins" />
      <Panel>
        {admins.length === 0 ? (
          <EmptyState icon="key" title="No admins" />
        ) : shown.length === 0 ? (
          <EmptyState icon="key" title="No admins match" hint="Try a different name, email or role." />
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead>
                <tr>
                  <th className={TABLE.th}>Admin</th>
                  <th className={TABLE.th}>Role</th>
                  <th className={`${TABLE.th} ${TABLE.hide}`}>Universities</th>
                  <th className={`${TABLE.th} w-10`}><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const expanded = open === row.id;
                  const scope = row.role === "PLATFORM_ADMIN" ? "All" : row.universities.map((u) => u.code).join(", ") || "None";
                  return (
                    <Fragment key={row.id}>
                      <tr className={`${TABLE.row} cursor-pointer`} onClick={() => setOpen(expanded ? null : row.id)}>
                        <td className={TABLE.td}>
                          <p className="font-medium">{row.name}{row.userId === currentUserId ? <span className="ml-2 text-xs font-normal text-[#7a716a]">you</span> : null}</p>
                          <p className="break-words text-[13px] text-[#6b635d]">{row.email}</p>
                          <p className="text-[13px] text-[#6b635d] md:hidden">{scope}</p>
                        </td>
                        <td className={TABLE.td}><Badge tone={row.role === "PLATFORM_ADMIN" ? "brand" : "neutral"}>{ADMIN_ROLE_LABEL[row.role]}</Badge>{row.pendingInvite ? <Badge tone="warning">Invitation pending</Badge> : null}<Badge tone={row.twoStep ? "success" : "warning"}>{row.twoStep ? "Two-step on" : "Two-step not set up"}</Badge></td>
                        <td className={`${TABLE.td} ${TABLE.hide} text-[#4e4742]`}>{scope}</td>
                        <td className={TABLE.td}>
                          <button type="button" aria-expanded={expanded} aria-label={expanded ? `Close ${row.name}` : `Edit ${row.name}`} onClick={(event) => { event.stopPropagation(); setOpen(expanded ? null : row.id); }} className={`flex h-7 w-7 items-center justify-center rounded text-[#7a716a] hover:bg-[#f1ede8] ${FOCUS}`}>
                            <Icon name="chevronRight" className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr><td colSpan={4} className="border-b border-[#eee9e3] bg-[#faf9f7] px-4 py-5">
                          <EditAdmin key={`${row.id}-${row.role}-${scope}`} row={row} universities={universities} isSelf={row.userId === currentUserId} onChanged={() => { setOpen(null); refresh(); }} />
                        </td></tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
