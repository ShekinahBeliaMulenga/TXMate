"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DURATION_MAX, DURATION_MIN, programmeReady, type StructureProgramme, type StructureSchool } from "@/lib/admin/structure-types";
import { GhostButton, PrimaryButton, SearchField, TextField } from "./admin-controls";
import { Badge, EmptyState, FOCUS, Panel } from "./admin-ui";

type Result = { ok: boolean; message: string } | null;

async function call(method: "PATCH" | "POST", body: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch("/api/admin/structure", { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    if (response.status === 401) { window.location.assign("/admin/login?expired=1"); return { ok: false, message: "Your session expired." }; }
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    return { ok: response.ok, message: (response.ok ? data.message : data.error) || (response.ok ? "Saved." : "Something went wrong.") };
  } catch {
    return { ok: false, message: "Network problem. Check your connection and try again." };
  }
}

function Notice({ result }: { result: Result }) {
  return result ? <p role={result.ok ? "status" : "alert"} className={`text-[13px] ${result.ok ? "text-[#28633b]" : "text-[#a3262a]"}`}>{result.message}</p> : null;
}

function ProgrammeRow({ programme, school, onSaved }: { programme: StructureProgramme; school: StructureSchool; onSaved: () => void }) {
  const [department, setDepartment] = useState(programme.departmentId ?? "");
  const [years, setYears] = useState(programme.years > 0 || programme.durationYears ? String(Math.max(programme.years, programme.durationYears ?? 0)) : "");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const departmentChanged = department !== (programme.departmentId ?? "") && department !== "";
  const yearsChanged = years !== "" && Number(years) !== Math.max(programme.years, programme.durationYears ?? 0);
  const dirty = departmentChanged || yearsChanged;
  const consequential = programme.students > 0 || (departmentChanged && programme.departmentId !== null);

  async function save() {
    setBusy(true);
    setResult(null);
    const outcome = await call("PATCH", { programmeId: programme.id, ...(departmentChanged ? { departmentId: department } : {}), ...(yearsChanged ? { durationYears: Number(years) } : {}) });
    setBusy(false);
    setAsking(false);
    setResult(outcome);
    if (outcome.ok) onSaved();
  }

  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-[#1f1a17]">{programme.name}</p>
          <p className="mt-0.5 break-words text-[13px] text-[#6b635d]">{programme.code} · {programme.level.toLowerCase()} · {programme.students} {programme.students === 1 ? "student" : "students"} enrolled · {programme.courses === 0 ? "no courses yet" : `${programme.courses} ${programme.courses === 1 ? "course" : "courses"} placed`}</p>
        </div>
        {programmeReady(programme) ? <Badge tone="success">Students can choose it</Badge> : <Badge tone="warning">{programme.departmentId === null && programme.years === 0 ? "Needs a department and years" : programme.departmentId === null ? "Needs a department" : "Needs years"}</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-0 text-[13px] text-[#3a332f]">
          <span className="block font-medium">Department</span>
          <select value={department} onChange={(event) => { setDepartment(event.target.value); setAsking(false); }} className={`mt-1 h-10 max-w-full rounded-md border border-[#d9d3cc] bg-white px-2.5 text-sm ${FOCUS}`}>
            {programme.departmentId === null ? <option value="">Choose a department</option> : null}
            {school.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-[13px] text-[#3a332f]">
          <span className="block font-medium">Years of study</span>
          <select value={years} onChange={(event) => { setYears(event.target.value); setAsking(false); }} className={`mt-1 h-10 rounded-md border border-[#d9d3cc] bg-white px-2.5 text-sm ${FOCUS}`}>
            {years === "" ? <option value="">Not set</option> : null}
            {Array.from({ length: DURATION_MAX - DURATION_MIN + 1 }, (_, index) => index + DURATION_MIN).map((count) => <option key={count} value={count} disabled={count < programme.years}>{count}</option>)}
          </select>
        </label>
        {dirty && !asking ? <PrimaryButton onClick={() => (consequential ? setAsking(true) : void save())} disabled={busy}>{busy ? "Saving…" : "Save"}</PrimaryButton> : null}
      </div>
      {asking ? (
        <div role="note" className="mt-3 rounded-md border border-[#ecd9a5] bg-[#fdf8e8] p-3 text-[13px] text-[#6a4b00]">
          <p className="font-semibold">Change a programme that is in use?</p>
          <p className="mt-1 leading-5">{programme.students} {programme.students === 1 ? "student is" : "students are"} enrolled here. {departmentChanged && programme.departmentId !== null ? "Moving it to another department changes where new students find it. " : ""}Years are only ever added, never removed. The change is recorded in the audit log.</p>
          <div className="mt-2 flex gap-2">
            <PrimaryButton onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Yes, save the change"}</PrimaryButton>
            <GhostButton onClick={() => setAsking(false)} disabled={busy}>Cancel</GhostButton>
          </div>
        </div>
      ) : null}
      <div className="mt-2"><Notice result={result} /></div>
    </li>
  );
}

function AddDepartment({ school, onSaved }: { school: StructureSchool; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const outcome = await call("POST", { schoolId: school.id, code, name });
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) { setCode(""); setName(""); setOpen(false); onSaved(); }
  }

  if (!open) return <GhostButton onClick={() => setOpen(true)}>Add department</GhostButton>;
  return (
    <form onSubmit={(event) => void submit(event)} className="flex w-full flex-wrap items-end gap-3">
      <div className="w-32"><TextField label="Code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={12} placeholder="CS" /></div>
      <div className="min-w-[14rem] flex-1"><TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} maxLength={150} placeholder="Department of Computer Science" /></div>
      <PrimaryButton type="submit" disabled={busy || !code.trim() || name.trim().length < 3}>{busy ? "Adding…" : "Add"}</PrimaryButton>
      <GhostButton onClick={() => setOpen(false)}>Cancel</GhostButton>
      <Notice result={result} />
    </form>
  );
}

export default function StructureManager({ schools, universityName }: { schools: StructureSchool[]; universityName: string }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const matches = (programme: StructureProgramme) => !needle || `${programme.code} ${programme.name} ${programme.level}`.toLowerCase().includes(needle);
  const total = schools.reduce((sum, school) => sum + school.programmes.length, 0);
  const unusable = schools.reduce((sum, school) => sum + school.programmes.filter((programme) => !programmeReady(programme)).length, 0);

  if (schools.length === 0) return <Panel><EmptyState icon="book" title={`${universityName} has no schools yet`} hint="Import a CSV from the Universities page to add schools, departments and programmes." /></Panel>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#4e4742]">{schools.length} {schools.length === 1 ? "school" : "schools"}, {total} {total === 1 ? "programme" : "programmes"}. {unusable > 0 ? <span className="font-semibold text-[#8a5a00]">{unusable} cannot be chosen by students yet.</span> : "Every programme can be chosen by students."}</p>
      <SearchField value={search} onChange={setSearch} placeholder="Search programme name, code or level" label="Search programmes" />
      {needle && schools.every((school) => !school.programmes.some(matches)) ? <Panel><EmptyState icon="book" title="No programmes match" hint="Try a different name or code." /></Panel> : null}
      {schools.filter((school) => !needle || school.programmes.some(matches)).map((school) => (
        <Panel key={school.id} title={`${school.name} · ${school.code}`}>
          <div className="flex flex-wrap items-center gap-3 border-b border-[#eee9e3] px-4 py-3 text-[13px] text-[#4e4742]">
            <span className="min-w-0 break-words">{school.departments.length === 0 ? "No departments yet. Add one before programmes can be assigned." : `Departments: ${school.departments.map((item) => item.name).join(", ")}`}</span>
            <AddDepartment school={school} onSaved={refresh} />
          </div>
          {school.programmes.length === 0 ? <p className="px-4 py-6 text-sm text-[#6b635d]">No programmes in this school.</p> : (
            <ul className="divide-y divide-[#eee9e3]">
              {school.programmes.filter(matches).map((programme) => <ProgrammeRow key={programme.id} programme={programme} school={school} onSaved={refresh} />)}
            </ul>
          )}
        </Panel>
      ))}
    </div>
  );
}
