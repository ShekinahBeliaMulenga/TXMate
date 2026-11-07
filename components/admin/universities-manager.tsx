"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import type { UniversityRow } from "@/lib/admin/universities";
import AcademicImportPanel from "./academic-import-panel";
import CourseImportPanel from "./course-import-panel";
import { GhostButton, PrimaryButton, TextField } from "./admin-controls";
import { Badge, EmptyState, FOCUS, Panel, TABLE } from "./admin-ui";

async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
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

function Notice({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return <p role={result.ok ? "status" : "alert"} className={`text-[13px] ${result.ok ? "text-[#28633b]" : "text-[#a3262a]"}`}>{result.message}</p>;
}

function AddUniversity({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const outcome = await send("/api/admin/universities", "POST", { name, code });
    setResult(outcome);
    setBusy(false);
    if (outcome.ok) onDone();
  }

  return (
    <Panel title="Add a university">
      <form onSubmit={(event) => void submit(event)} className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder="Copperbelt University" />
          <TextField label="Code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={12} required placeholder="CBU" hint="Letters and numbers, unique." />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton type="submit" disabled={busy || name.trim().length < 3 || code.trim().length < 2}>{busy ? "Adding…" : "Add university"}</PrimaryButton>
          <Notice result={result} />
        </div>
        <p className="text-xs text-[#7a716a]">After adding, open it to set student ID rules, then give its admin access from the Admins page.</p>
      </form>
    </Panel>
  );
}

function EditUniversity({ row, onSaved }: { row: UniversityRow; onSaved: () => void }) {
  const s = row.settings;
  const [name, setName] = useState(row.name);
  const [status, setStatus] = useState(row.status);
  const [min, setMin] = useState(String(s.studentIdMinLength));
  const [max, setMax] = useState(String(s.studentIdMaxLength));
  const [prefix, setPrefix] = useState(s.studentIdPrefix ?? "");
  const [pattern, setPattern] = useState(s.studentIdPattern ?? "");
  const [requireEmail, setRequireEmail] = useState(s.requireUniversityEmail);
  const [domain, setDomain] = useState(s.universityEmailDomain ?? "");
  const [sample, setSample] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Live preview of the rule against an example ID, so mistakes are caught before saving.
  let preview: string | null = null;
  if (sample.trim()) {
    const id = sample.trim();
    const minN = Number(min), maxN = Number(max);
    if (id.length < minN || id.length > maxN) preview = `Rejected: length must be ${minN}–${maxN}.`;
    else if (prefix && !id.startsWith(prefix)) preview = `Rejected: must start with ${prefix}.`;
    else {
      try {
        preview = pattern && !new RegExp(pattern).test(id) ? "Rejected: doesn’t match the pattern." : "Accepted.";
      } catch {
        preview = "The pattern isn’t valid yet.";
      }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const outcome = await send(`/api/admin/universities/${encodeURIComponent(row.id)}`, "PATCH", {
      name,
      status,
      settings: {
        studentIdMinLength: Number(min),
        studentIdMaxLength: Number(max),
        studentIdPrefix: prefix.trim() || null,
        studentIdPattern: pattern.trim() || null,
        requireUniversityEmail: requireEmail,
        universityEmailDomain: domain.trim() || null,
      },
    });
    setResult(outcome);
    setBusy(false);
    if (outcome.ok) onSaved();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
        <label className="block">
          <span className="text-[13px] font-medium text-[#3a332f]">Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as "ACTIVE" | "INACTIVE")} className={`mt-1 h-10 w-full rounded-md border border-[#d9d3cc] bg-white px-3 text-sm ${FOCUS}`}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
      </div>
      {status === "INACTIVE" && row.status === "ACTIVE" ? (
        <div role="alert" className="rounded-md border border-[#ecd9a5] bg-[#fdf8e8] p-3 text-[13px] leading-5 text-[#6a4b00]">
          <p className="font-semibold">You are about to deactivate {row.name}.</p>
          <p className="mt-1">It has {row.students} {row.students === 1 ? "student" : "students"} and {row.mates} Academic {row.mates === 1 ? "Mate" : "Mates"}. Check what deactivation does in your sign-up and sign-in flow before saving, and tell the university’s admins first. The change is recorded in the audit log.</p>
        </div>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">Student ID rules</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TextField label="Min length" inputMode="numeric" value={min} onChange={(event) => setMin(event.target.value.replace(/\D/g, ""))} />
          <TextField label="Max length" inputMode="numeric" value={max} onChange={(event) => setMax(event.target.value.replace(/\D/g, ""))} />
          <TextField label="Prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} maxLength={20} placeholder="optional" />
          <TextField label="Pattern" value={pattern} onChange={(event) => setPattern(event.target.value)} maxLength={120} placeholder="^\d{8}$" hint="Optional regular expression." />
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end">
          <TextField label="Try an example ID" value={sample} onChange={(event) => setSample(event.target.value)} maxLength={60} />
          {preview ? <p className={`pb-2 text-[13px] font-medium ${preview === "Accepted." ? "text-[#28633b]" : "text-[#a3262a]"}`}>{preview}</p> : null}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">University email</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requireEmail} onChange={(event) => setRequireEmail(event.target.checked)} className="h-4 w-4 accent-[#7d1f2a]" />
          Require a university email address at sign-up
        </label>
        <div className="sm:max-w-xs"><TextField label="Email domain" value={domain} onChange={(event) => setDomain(event.target.value)} maxLength={100} placeholder="cbu.ac.zm" /></div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</PrimaryButton>
        <Notice result={result} />
      </div>
    </form>
  );
}

export default function UniversitiesManager({ universities }: { universities: UniversityRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(universities.length === 0);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = () => router.refresh();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <GhostButton onClick={() => setAdding((value) => !value)} aria-expanded={adding}>
          <Icon name={adding ? "close" : "plus"} className="h-4 w-4" />{adding ? "Close" : "Add university"}
        </GhostButton>
      </div>
      {adding ? <AddUniversity onDone={() => { setAdding(false); refresh(); }} /> : null}

      <Panel>
        {universities.length === 0 ? (
          <EmptyState icon="university" title="No universities yet" hint="Add the first one to start onboarding students." />
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead>
                <tr>
                  <th className={TABLE.th}>University</th>
                  <th className={`${TABLE.th} ${TABLE.hideSm} text-right`}>Students</th>
                  <th className={`${TABLE.th} ${TABLE.hideSm} text-right`}>Mates</th>
                  <th className={`${TABLE.th} ${TABLE.hide} text-right`}>Admins</th>
                  <th className={TABLE.th}>Status</th>
                  <th className={`${TABLE.th} w-10`}><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody>
                {universities.map((row) => {
                  const expanded = open === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr className={`${TABLE.row} cursor-pointer`} onClick={() => setOpen(expanded ? null : row.id)}>
                        <td className={TABLE.td}>
                          <p className="font-medium">{row.name}</p>
                          <p className="font-mono text-xs text-[#7a716a]">{row.code}</p>
                        </td>
                        <td className={`${TABLE.td} ${TABLE.hideSm} text-right tabular-nums`}>{row.students}</td>
                        <td className={`${TABLE.td} ${TABLE.hideSm} text-right tabular-nums`}>{row.mates}</td>
                        <td className={`${TABLE.td} ${TABLE.hide} text-right tabular-nums`}>{row.admins}</td>
                        <td className={TABLE.td}><Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status === "ACTIVE" ? "Active" : "Inactive"}</Badge></td>
                        <td className={TABLE.td}>
                          <button type="button" aria-expanded={expanded} aria-label={expanded ? `Close ${row.name}` : `Edit ${row.name}`} onClick={(event) => { event.stopPropagation(); setOpen(expanded ? null : row.id); }} className={`flex h-7 w-7 items-center justify-center rounded text-[#7a716a] hover:bg-[#f1ede8] ${FOCUS}`}>
                            <Icon name="chevronRight" className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr><td colSpan={6} className="border-b border-[#eee9e3] bg-[#faf9f7] px-4 py-5">
                          <div className="space-y-8">
                            <EditUniversity key={`${row.id}-${row.settings.studentIdPattern}-${row.name}-${row.status}`} row={row} onSaved={refresh} />
                            <AcademicImportPanel universityId={row.id} universityName={row.name} onImported={refresh} />
                            <CourseImportPanel universityId={row.id} universityName={row.name} onImported={refresh} />
                          </div>
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
