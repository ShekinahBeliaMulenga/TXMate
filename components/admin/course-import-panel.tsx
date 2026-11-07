"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { IMPORT_MAX_CHARS, type ImportProblem } from "@/lib/admin/academic-import-rules";
import type { CourseImportSummary, CourseRename } from "@/lib/admin/course-import";
import { COURSE_EXAMPLE, COURSE_TEMPLATE, validateCourseImport } from "@/lib/admin/course-import-rules";
import { GhostButton, PrimaryButton } from "./admin-controls";
import { FOCUS } from "./admin-ui";

type Preview = { summary: CourseImportSummary; renames: CourseRename[] };

/** Courses per programme and year. Same safe flow as the programme import: check, preview, confirm, apply. */
export default function CourseImportPanel({ universityId, universityName, onImported }: { universityId: string; universityName: string; onImported: () => void }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [problems, setProblems] = useState<ImportProblem[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset(text: string) { setCsv(text); setPreview(null); setProblems([]); setMessage(null); setConfirmed(false); }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > IMPORT_MAX_CHARS) return setMessage({ ok: false, text: "That file is too large (limit about 1 MB)." });
    reset(await file.text());
  }

  async function run(dryRun: boolean) {
    if (busy) return;
    const local = validateCourseImport(csv);
    if (local.fatal) return setMessage({ ok: false, text: local.fatal });
    if (local.problems.length > 0) { setProblems(local.problems.slice(0, 50)); return setMessage({ ok: false, text: `${local.problems.length} row${local.problems.length === 1 ? " has" : "s have"} problems.` }); }
    if (local.rows.length === 0) return setMessage({ ok: false, text: "The file has headings but no courses. Add at least one row." });
    setBusy(true); setMessage(null); setProblems([]);
    try {
      const response = await fetch(`/api/admin/universities/${encodeURIComponent(universityId)}/course-import`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ csv, dryRun }) });
      if (response.status === 401) { window.location.assign("/admin/login?expired=1"); return; }
      const data = (await response.json().catch(() => ({}))) as { error?: string; problems?: ImportProblem[]; summary?: CourseImportSummary; renames?: CourseRename[] };
      if (!response.ok || !data.summary) { setProblems(data.problems ?? []); setPreview(null); return setMessage({ ok: false, text: data.error || "The import failed." }); }
      if (dryRun) setPreview({ summary: data.summary, renames: data.renames ?? [] });
      else { setMessage({ ok: true, text: "Imported. Students can now see these courses." }); setCsv(""); setPreview(null); setConfirmed(false); onImported(); }
    } catch {
      setMessage({ ok: false, text: "Network problem. Check your connection and try again." });
    } finally { setBusy(false); }
  }

  const s = preview?.summary;
  return (
    <fieldset className="space-y-3">
      <legend className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">Courses for each programme and year</legend>
      <p className="text-[13px] leading-5 text-[#6b635d]">
        Add or update the courses {universityName} teaches, programme by programme and year by year. The programmes and their years must already exist. Courses are matched by code, nothing is deleted, and you can mark courses as compulsory or as part of an elective group students choose from.
      </p>
      <p className="break-words font-mono text-xs leading-5 text-[#6b635d]">Columns: programme_code, year_number, course_code, course_name, semester, type, elective_group, min_selections, max_selections, credits. Example row: {COURSE_EXAMPLE}</p>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(event) => void onFile(event)} className="sr-only" aria-label="Choose a course CSV file" tabIndex={-1} />
        <GhostButton onClick={() => fileRef.current?.click()}>Choose CSV file</GhostButton>
        <GhostButton onClick={() => reset(COURSE_TEMPLATE)}>Start from headings</GhostButton>
      </div>
      <label className="block"><span className="sr-only">Course CSV contents</span>
        <textarea value={csv} onChange={(event) => reset(event.target.value)} rows={6} spellCheck={false} placeholder={COURSE_TEMPLATE.trim()} className={`w-full rounded-md border border-[#d9d3cc] bg-white p-3 font-mono text-xs leading-5 ${FOCUS}`} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <GhostButton onClick={() => void run(true)} disabled={busy || csv.trim() === ""}>{busy && !preview ? "Checking…" : "Preview changes"}</GhostButton>
        <PrimaryButton onClick={() => void run(false)} disabled={busy || !preview || !confirmed}>{busy && preview ? "Importing…" : "Import courses to live data"}</PrimaryButton>
        {message ? <p role={message.ok ? "status" : "alert"} className={`text-[13px] ${message.ok ? "text-[#28633b]" : "text-[#a3262a]"}`}>{message.text}</p> : null}
      </div>
      {problems.length > 0 ? <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-[#f0c9c9] bg-[#fdf3f3] p-3 text-[13px] text-[#8f2323]">{problems.map((problem, index) => <li key={`${problem.line}-${index}`} className="break-words">Line {problem.line}: {problem.message}</li>)}</ul> : null}
      {s ? (
        <div className="rounded-md border border-[#e4dfd9] bg-white p-3 text-[13px]">
          <p className="font-semibold text-[#1f1a17]">This will:</p>
          <ul className="mt-1 space-y-0.5 text-[#4e4742]">
            <li>Courses: {s.courses.created} new, {s.courses.updated} existing</li>
            <li>Placements in programme years: {s.placements.created} new, {s.placements.updated} updated</li>
            <li>Elective groups: {s.electiveGroups.created} new</li>
          </ul>
          <div role="note" className="mt-3 rounded-md border border-[#ecd9a5] bg-[#fdf8e8] p-3 text-[#6a4b00]">
            {preview && preview.renames.length > 0 ? (
              <div className="mb-2 rounded-md border border-[#e3b5b7] bg-white p-2 text-[#8f2323]">
                <p className="font-semibold">{preview.renames.length} existing course {preview.renames.length === 1 ? "name" : "names"} will be overwritten:</p>
                <ul className="mt-1 space-y-0.5">{preview.renames.map((item) => <li key={item.code} className="break-words">{item.code}: “{item.from}” becomes “{item.to}”</li>)}</ul>
              </div>
            ) : null}
            <p className="font-semibold">This changes live data.</p>
            <p className="mt-1 leading-5">Students see these courses straight away. The import is recorded in the audit log and cannot be undone automatically.</p>
            <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>I have checked this preview and want to import it.</span></label>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
