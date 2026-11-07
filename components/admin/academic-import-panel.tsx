"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { IMPORT_MAX_CHARS, IMPORT_TEMPLATE, validateImport, type ImportProblem } from "@/lib/admin/academic-import-rules";
import type { ImportSummary, Rename } from "@/lib/admin/academic-import";
import { GhostButton, PrimaryButton } from "./admin-controls";
import { FOCUS } from "./admin-ui";

type Preview = { summary: ImportSummary; renames: Rename[]; sample: Array<{ line: number; school: string; programme: string; status: "new" | "update" }> };

/** Upload or paste a CSV, preview exactly what will change, then apply. Nothing is deleted. */
export default function AcademicImportPanel({ universityId, universityName, onImported }: { universityId: string; universityName: string; onImported: () => void }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [problems, setProblems] = useState<ImportProblem[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset(text: string) {
    setCsv(text);
    setPreview(null);
    setProblems([]);
    setMessage(null);
    setConfirmed(false);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > IMPORT_MAX_CHARS) return setMessage({ ok: false, text: "That file is too large (limit about 1 MB)." });
    reset(await file.text());
  }

  async function run(dryRun: boolean) {
    if (busy) return;
    // Catch format mistakes instantly in the browser; the server checks again.
    const local = validateImport(csv);
    if (local.fatal) return setMessage({ ok: false, text: local.fatal });
    if (local.problems.length > 0) {
      setProblems(local.problems.slice(0, 50));
      return setMessage({ ok: false, text: `${local.problems.length} row${local.problems.length === 1 ? " has" : "s have"} problems.` });
    }
    setBusy(true);
    setMessage(null);
    setProblems([]);
    try {
      const response = await fetch(`/api/admin/universities/${encodeURIComponent(universityId)}/academic-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ csv, dryRun, defaultDuration: defaultDuration === "" ? null : Number(defaultDuration) }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login?expired=1");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string; problems?: ImportProblem[]; summary?: ImportSummary; sample?: Preview["sample"]; renames?: Rename[] };
      if (!response.ok || !data.summary) {
        setProblems(data.problems ?? []);
        setPreview(null);
        return setMessage({ ok: false, text: data.error || "The import failed." });
      }
      setPreview({ summary: data.summary, renames: data.renames ?? [], sample: data.sample ?? [] });
      if (!dryRun) {
        setMessage({ ok: true, text: "Imported. Students can now pick these programmes." });
        setCsv("");
        setPreview(null);
        onImported();
      }
    } catch {
      setMessage({ ok: false, text: "Network problem. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const s = preview?.summary;
  return (
    <fieldset className="space-y-3">
      <legend className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">Schools, departments and programmes</legend>
      <p className="text-[13px] leading-5 text-[#6b635d]">
        Add or update {universityName}’s academic structure from a CSV. Existing records are updated by code; nothing is deleted. A programme needs a department and at least one year of study before students can choose it. Leave duration_years blank if you do not know it: no years are created for that programme until you set its length in Academic structure.
      </p>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(event) => void onFile(event)} className="sr-only" aria-label="Choose a CSV file" tabIndex={-1} />
        <GhostButton onClick={() => fileRef.current?.click()}>Choose CSV file</GhostButton>
        <GhostButton onClick={() => reset(IMPORT_TEMPLATE)}>Start from headings</GhostButton>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-[13px] text-[#4e4742]">
        <span>Duration for rows that leave it blank</span>
        <select value={defaultDuration} onChange={(event) => { setDefaultDuration(event.target.value); setPreview(null); setConfirmed(false); }} className={`h-9 rounded-md border border-[#d9d3cc] bg-white px-2 text-sm ${FOCUS}`}>
          <option value="">Unknown (create no years)</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((years) => <option key={years} value={years}>{years} {years === 1 ? "year" : "years"}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">CSV contents</span>
        <textarea
          value={csv}
          onChange={(event) => reset(event.target.value)}
          rows={6}
          spellCheck={false}
          placeholder="school_code,school_name,department_code,department_name,programme_code,programme_name,level,duration_years"
          className={`w-full rounded-md border border-[#d9d3cc] bg-white p-3 font-mono text-xs leading-5 ${FOCUS}`}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <GhostButton onClick={() => void run(true)} disabled={busy || csv.trim() === ""}>{busy && !preview ? "Checking…" : "Preview changes"}</GhostButton>
        <PrimaryButton onClick={() => void run(false)} disabled={busy || !preview || !confirmed}>{busy && preview ? "Importing…" : "Import to live data"}</PrimaryButton>
        {message ? <p role={message.ok ? "status" : "alert"} className={`text-[13px] ${message.ok ? "text-[#28633b]" : "text-[#a3262a]"}`}>{message.text}</p> : null}
      </div>

      {problems.length > 0 ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-[#f0c9c9] bg-[#fdf3f3] p-3 text-[13px] text-[#8f2323]">
          {problems.map((problem, index) => <li key={`${problem.line}-${index}`}>Line {problem.line}: {problem.message}</li>)}
        </ul>
      ) : null}

      {s ? (
        <div className="rounded-md border border-[#e4dfd9] bg-white p-3 text-[13px]">
          <p className="font-semibold text-[#1f1a17]">This will:</p>
          <ul className="mt-1 space-y-0.5 text-[#4e4742]">
            <li>Schools: {s.schools.created} new, {s.schools.updated} updated</li>
            <li>Departments: {s.departments.created} new, {s.departments.updated} updated</li>
            <li>Programmes: {s.programmes.created} new, {s.programmes.updated} updated</li>
            <li>Programme years: {s.yearsToCreate} to add</li>
            {s.withoutDuration > 0 ? <li className="font-medium text-[#8a5a00]">{s.withoutDuration} {s.withoutDuration === 1 ? "programme has" : "programmes have"} no duration, so students cannot pick {s.withoutDuration === 1 ? "it" : "them"} yet.</li> : null}
          </ul>
          {preview && preview.sample.length > 0 ? (
            <p className="mt-2 break-words text-xs text-[#7a716a]">Rows checked: {preview.sample.map((row) => `${row.programme} (${row.status})`).join(" · ")}</p>
          ) : null}
          <div role="note" className="mt-3 rounded-md border border-[#ecd9a5] bg-[#fdf8e8] p-3 text-[#6a4b00]">
            {preview && preview.renames.length > 0 ? (
              <div className="mb-2 rounded-md border border-[#e3b5b7] bg-white p-2 text-[#8f2323]">
                <p className="font-semibold">{preview.renames.length} existing {preview.renames.length === 1 ? "name" : "names"} will be overwritten:</p>
                <ul className="mt-1 space-y-0.5">{preview.renames.map((item) => <li key={`${item.kind}-${item.code}`} className="break-words">{item.kind} {item.code}: “{item.from}” becomes “{item.to}”</li>)}</ul>
              </div>
            ) : null}
            <p className="font-semibold">This changes live data.</p>
            <p className="mt-1 leading-5">Students see these schools, departments and programmes straight away. Names of existing records are overwritten and the import is recorded in the audit log. It cannot be undone automatically.</p>
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>I have checked this preview and want to import it.</span>
            </label>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
