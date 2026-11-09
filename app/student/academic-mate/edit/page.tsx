"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";

type AcademicMate = {
  id: string; userId: string; universityId: string; studentProfileId: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  headline: string | null; bio: string | null; teachingExperience: string | null; yearsExperience: number | null;
  profileVisibility: ProfileVisibility; verifiedAt: string | null; verifiedByAdminId: string | null;
  createdAt: string; updatedAt: string;
  qualifications?: { id: string; name: string; issuer: string | null; year: number | null; credentialUrl: string | null }[];
  experiences?: { id: string; title: string; organisation: string | null; description: string | null; startYear: number | null; endYear: number | null }[];
};

/** Form rows keep every field as text; the server validates and converts them. */
type QualificationRow = { key: string; name: string; issuer: string; year: string; credentialUrl: string };
type ExperienceRow = { key: string; title: string; organisation: string; description: string; startYear: string; endYear: string };
type ApiBody = { academicMate?: AcademicMate | null; error?: string };

const MAX_ROWS = 10;
const STEPS = ["About you", "Experience", "Qualifications", "Review & visibility"] as const;
const toYear = (value: string) => (value.trim() === "" ? null : Number(value));
const str = (value: number | null) => (value === null ? "" : String(value));

function Svg({ className, d }: { className: string; d: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} /></svg>;
}

const visibilityOptions: { value: ProfileVisibility; label: string; description: string; icon: string }[] = [
  { value: "PUBLIC", label: "Public", description: "Your Academic Mate profile can be discovered by other TXMate members.", icon: "M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 014 9 15.3 15.3 0 01-4 9 15.3 15.3 0 01-4-9 15.3 15.3 0 014-9z" },
  { value: "MEMBERS_ONLY", label: "Members only", description: "Only signed-in TXMate members can view your Academic Mate profile.", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
  { value: "PRIVATE", label: "Private", description: "Your Academic Mate profile will not be publicly discoverable.", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
];

/* Reads a JSON body without throwing, so an HTML error page or empty body can't crash the page. */
async function readBody(response: Response): Promise<ApiBody | null> {
  try { return (await response.json()) as ApiBody; } catch { return null; }
}

export default function AcademicMatePage() {
  const [academicMate, setAcademicMate] = useState<AcademicMate | null>(null);
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [teachingExperience, setTeachingExperience] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>("PUBLIC");
  const [qualifications, setQualifications] = useState<QualificationRow[]>([]);
  const [experiences, setExperiences] = useState<ExperienceRow[]>([]);
  const [justCreated, setJustCreated] = useState(false);
  const [step, setStep] = useState(0);
  const [justAdded, setJustAdded] = useState<string | null>(null); // row whose first field takes focus
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const rowKey = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const nextKey = useCallback(() => `row-${++rowKey.current}`, []);
  const isEditing = academicMate !== null;

  const patchQualification = (key: string, patch: Partial<QualificationRow>) => setQualifications((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const patchExperience = (key: string, patch: Partial<ExperienceRow>) => setExperiences((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Copies a profile from the server into the form. Related lists are only replaced when the server sent them. */
  const fillForm = useCallback((mate: AcademicMate) => {
    setAcademicMate(mate);
    setHeadline(mate.headline ?? "");
    setBio(mate.bio ?? "");
    setTeachingExperience(mate.teachingExperience ?? "");
    setYearsExperience(str(mate.yearsExperience));
    setProfileVisibility(mate.profileVisibility);
    if (Array.isArray(mate.qualifications)) setQualifications(mate.qualifications.map((q) => ({ key: nextKey(), name: q.name, issuer: q.issuer ?? "", year: str(q.year), credentialUrl: q.credentialUrl ?? "" })));
    if (Array.isArray(mate.experiences)) setExperiences(mate.experiences.map((e) => ({ key: nextKey(), title: e.title, organisation: e.organisation ?? "", description: e.description ?? "", startYear: str(e.startYear), endYear: str(e.endYear) })));
  }, [nextKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadAcademicMate() {
      try {
        setLoading(true);
        setLoadFailed(false);
        setError("");
        const response = await fetch("/api/student/academic-mate", { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
        const data = await readBody(response);
        if (cancelled) return;
        // No profile yet: show the "Become an Academic Mate" form.
        if (response.status === 404) { setAcademicMate(null); return; }
        if (!response.ok) throw new Error(data?.error || "Unable to load your Academic Mate profile.");
        const mate = data?.academicMate ?? null;
        if (mate) fillForm(mate); else setAcademicMate(null);
      } catch (err) {
        if (cancelled) return;
        // A failed load is not the same as "no profile", so don't show the create form.
        setLoadFailed(true);
        setError(err instanceof Error ? err.message : "Unable to load your Academic Mate profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadAcademicMate();
    return () => { cancelled = true; };
  }, [reloadKey, fillForm]);

  // Brings the message into view (the buttons are far from the banners) and lets success messages fade away.
  useEffect(() => {
    if (!error && !success) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 8000);
    return () => window.clearTimeout(timer);
  }, [error, success]);

  /** The first field in a step that breaks its own rules (min, max, url...), using the browser's checks. */
  function firstInvalid(n: number) {
    const sections = formRef.current?.querySelectorAll(`[data-step="${n}"]`) ?? [];
    for (const section of Array.from(sections)) {
      for (const control of Array.from(section.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))) {
        if (!control.checkValidity()) return control;
      }
    }
    return null;
  }

  /**
   * Checks one step, or every step when none is given. On a problem it jumps to that step and points at the field.
   * Fields on earlier steps stay mounted but hidden, so the browser alone could block a submit without saying why.
   */
  function validate(only?: number): boolean {
    for (const n of only === undefined ? STEPS.map((_, i) => i) : [only]) {
      if (n === 0 && !isEditing && !headline.trim()) {
        setError("Add a short headline so students know what you can help with.");
        setStep(0);
        return false;
      }
      const invalid = firstInvalid(n);
      if (invalid) {
        if (!isEditing) setStep(n);
        window.setTimeout(() => invalid.reportValidity(), 0);
        return false;
      }
      if (n === 1) {
        const bad = experiences.findIndex((e) => e.startYear.trim() && e.endYear.trim() && Number(e.endYear) < Number(e.startYear));
        if (bad !== -1) {
          setError(`Role ${bad + 1}: the end year can't be before the start year.`);
          if (!isEditing) setStep(1);
          return false;
        }
      }
    }
    return true;
  }

  /** Blank rows are left out; everything else is sent for the server to validate. */
  function profilePayload() {
    return {
      headline: headline.trim() || null,
      bio: bio.trim() || null,
      teachingExperience: teachingExperience.trim() || null,
      yearsExperience: yearsExperience.trim() === "" ? null : Number(yearsExperience),
      profileVisibility,
      qualifications: qualifications
        .filter((q) => q.name.trim() || q.issuer.trim() || q.year.trim() || q.credentialUrl.trim())
        .map((q) => ({ name: q.name, issuer: q.issuer, year: toYear(q.year), credentialUrl: q.credentialUrl })),
      experiences: experiences
        .filter((e) => e.title.trim() || e.organisation.trim() || e.description.trim() || e.startYear.trim() || e.endYear.trim())
        .map((e) => ({ title: e.title, organisation: e.organisation, description: e.description, startYear: toYear(e.startYear), endYear: toYear(e.endYear) })),
    };
  }

  /** Moves the create flow forward after checking the current step. */
  function goNext() {
    setError("");
    if (!validate(step)) return;
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setError("");
    setStep((current) => Math.max(current - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Pressing Enter (or Next) on an earlier step moves on instead of submitting half a profile.
    if (step < STEPS.length - 1) { goNext(); return; }
    setError("");
    setSuccess("");
    if (!validate()) return;
    setCreating(true);
    try {
      const response = await fetch("/api/student/academic-mate", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(profilePayload()) });
      const data = await readBody(response);
      // The profile already exists (for example it was created in another tab): reload to show the edit form.
      if (response.status === 409) {
        setSuccess("You already have an Academic Mate profile. Showing it now.");
        setReloadKey((key) => key + 1);
        return;
      }
      if (!response.ok) throw new Error(data?.error || "Unable to create your Academic Mate profile.");
      if (!data?.academicMate) throw new Error("The server returned an invalid response.");
      fillForm(data.academicMate);
      setJustCreated(true);
      setSuccess("Your Academic Mate profile has been created.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create your Academic Mate profile.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!validate()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/student/academic-mate", { method: "PATCH", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(profilePayload()) });
      const data = await readBody(response);
      if (!response.ok) throw new Error(data?.error || "Unable to save your Academic Mate profile.");
      if (!data?.academicMate) throw new Error("The server returned an invalid response.");
      fillForm(data.academicMate); // show what the server actually stored
      setJustCreated(false);
      setSuccess("Your Academic Mate profile has been updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save your Academic Mate profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f4f1ed] text-[#241f1c]">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="h-4 w-32 animate-pulse rounded bg-[#e2d9d0]" />
          <div className="mt-8 space-y-3">
            <div className="h-8 w-64 animate-pulse rounded-md bg-[#e2d9d0]" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[#e2d9d0]" />
          </div>
          <div className="mt-10 h-96 animate-pulse rounded-2xl border border-[#e2d9d0]/60 bg-white shadow-sm" />
          <div className="mt-6 h-64 animate-pulse rounded-2xl border border-[#e2d9d0]/60 bg-white shadow-sm" />
        </div>
      </main>
    );
  }

  if (loadFailed) {
    return (
      <main className="min-h-screen bg-[#f4f1ed] antialiased">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div role="alert" className="rounded-2xl border border-red-200 bg-white px-6 py-10 text-center shadow-sm">
            <h1 className="text-lg font-bold text-[#241f1c]">We couldn&apos;t load your profile</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#625b55]">{error}</p>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-5 rounded-xl bg-[#7d1f2a] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#681923] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/40">Try again</button>
          </div>
        </div>
      </main>
    );
  }

  /** In edit mode every section is shown; while creating, only the current step. */
  const show = (n: number) => isEditing || step === n;
  const isLastStep = step === STEPS.length - 1;
  const busy = creating || saving;
  const secondary = "rounded-xl border border-[#d8cec5] bg-white px-5 py-2.5 text-sm font-semibold text-[#4e4742] shadow-sm transition hover:bg-[#faf8f6]";
  const primary = "inline-flex items-center justify-center rounded-xl bg-[#7d1f2a] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#681923] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/40";

  return (
    <main className="min-h-screen bg-[#f4f1ed] antialiased">
      <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-8 border-b border-[#e2d9d0] pb-8">
          <div className={`${isEditing ? "mt-6" : "mt-0"} flex flex-col items-start justify-between gap-4 md:flex-row md:items-end`}>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#241f1c] sm:text-4xl">{isEditing ? "Academic Mate Profile" : "Become an Academic Mate"}</h1>
              <p className="mt-2 text-sm text-[#625b55] sm:text-base">
                {isEditing ? "Manage the information students will use to understand your academic support profile." : "Offer academic support to other students through TXMate."}
              </p>
            </div>
            {isEditing && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">
                <StatusBadge label="Status" value={academicMate.status} />
                <StatusBadge label="Verification" value={academicMate.verificationStatus} />
              </div>
            )}
          </div>
        </div>

        <div ref={feedbackRef}>
          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3.5 text-sm text-red-800 shadow-sm backdrop-blur-sm" role="alert">
              <Svg className="h-5 w-5 shrink-0 text-red-600" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3.5 text-sm text-emerald-800 shadow-sm backdrop-blur-sm" role="status">
              <Svg className="h-5 w-5 shrink-0 text-emerald-600" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              <span>{success}</span>
            </div>
          )}
        </div>

        {justCreated && (
          <section className="mb-6 rounded-2xl border border-[#e2d9d0] bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-[#241f1c]">Next steps</h2>
            <p className="mt-1 text-xs text-[#6b625c]">Students can find you once you have a course to offer. Verification builds trust.</p>
            <ol className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { href: "/student/academic-mate/offerings", title: "Add the courses you teach", text: "Set your rate and session length." },
                { href: "/student/academic-mate/availability", title: "Set your availability", text: "Choose when students can book you." },
                { href: "/student/academic-mate/verification", title: "Get verified", text: "Upload your documents for review." },
              ].map((item, index) => (
                <li key={item.href}>
                  <Link href={item.href} className="block h-full rounded-xl border border-[#e2d9d0] p-4 transition hover:border-[#7d1f2a] hover:bg-[#faf8f6] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/30">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7d1f2a] text-xs font-bold text-white">{index + 1}</span>
                    <span className="mt-2 block text-sm font-semibold text-[#241f1c]">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-[#6b625c]">{item.text}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        {!isEditing && (
          <nav aria-label="Progress" className="mb-6">
            <p aria-live="polite" className="text-xs font-semibold text-[#6b625c]">Step {step + 1} of {STEPS.length}: <span className="text-[#241f1c]">{STEPS[step]}</span></p>
            <div className="mt-2 grid grid-cols-4 gap-1.5" role="presentation">
              {STEPS.map((label, index) => <div key={label} className={`h-1.5 rounded-full transition-colors ${index <= step ? "bg-[#7d1f2a]" : "bg-[#e2d9d0]"}`} />)}
            </div>
          </nav>
        )}

        {/* noValidate: the checks run in validate(), so a problem on a hidden step is never silent. */}
        <form ref={formRef} noValidate onSubmit={isEditing ? handleSave : handleCreate} className="space-y-8">
          <Card step={0} hidden={!show(0)} title="About your academic support" description="Provide details about your expertise and what you can help students with.">
            <Field id="am-headline" label="Headline" description="A short, catchy description of the academic support you provide.">
              <input id="am-headline" aria-describedby="am-headline-desc" type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} placeholder="e.g. Computer Science student offering programming support" className={inputClass} />
              <CharacterCount value={headline} max={120} />
            </Field>
            <Field id="am-bio" label="Bio" description="Give students more context about your academic background.">
              <textarea id="am-bio" aria-describedby="am-bio-desc" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1000} rows={4} placeholder="Describe your academic background and the kind of support you provide." className={textareaClass} />
              <CharacterCount value={bio} max={1000} />
            </Field>
          </Card>

          <Card step={1} hidden={!show(1)} title="Your experience" description="Tutoring, mentoring or peer-support background. Everything here is optional.">
            <Field id="am-teaching" label="Teaching experience" description="Describe relevant tutoring, mentoring, teaching, or peer-support experience.">
              <textarea id="am-teaching" aria-describedby="am-teaching-desc" value={teachingExperience} onChange={(e) => setTeachingExperience(e.target.value)} maxLength={1000} rows={4} placeholder="List any formal or informal relevant experience." className={textareaClass} />
              <CharacterCount value={teachingExperience} max={1000} />
            </Field>
            <Field id="am-years" label="Years of experience" description="Total years of relevant teaching or academic support experience.">
              <div className="relative max-w-[12rem]">
                <input id="am-years" aria-describedby="am-years-desc" type="number" inputMode="numeric" min={0} max={100} step={1} value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} placeholder="0" className={`${inputClass} pr-14`} />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4"><span className="text-xs font-semibold text-[#8a817a]">years</span></div>
              </div>
            </Field>
          </Card>

          {/* Roles sit next to the experience text so both show on the same step. */}
          <RowsSection
            step={1} hidden={!show(1)} title="Roles and positions" description="Tutoring, teaching, mentoring or relevant work. Optional, up to 10."
            addLabel="Add a role" empty="No roles yet. Peer tutoring, class representative roles or teaching assistant work all count." count={experiences.length}
            onAdd={() => {
              const key = nextKey();
              setJustAdded(key);
              setExperiences((rows) => [...rows, { key, title: "", organisation: "", description: "", startYear: "", endYear: "" }]);
            }}
          >
            {experiences.map((row, index) => (
              <RowCard key={row.key} label={`Role ${index + 1}`} onRemove={() => setExperiences((rows) => rows.filter((r) => r.key !== row.key))}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MiniField label="Role"><input type="text" autoFocus={row.key === justAdded} value={row.title} maxLength={120} onChange={(e) => patchExperience(row.key, { title: e.target.value })} placeholder="e.g. Peer tutor" className={inputClass} /></MiniField>
                  <MiniField label="Where"><input type="text" value={row.organisation} maxLength={120} onChange={(e) => patchExperience(row.key, { organisation: e.target.value })} placeholder="e.g. School of Natural Sciences" className={inputClass} /></MiniField>
                  <MiniField label="From (year)"><input type="number" inputMode="numeric" min={1950} max={2100} value={row.startYear} onChange={(e) => patchExperience(row.key, { startYear: e.target.value })} placeholder="e.g. 2023" className={inputClass} /></MiniField>
                  <MiniField label="To (year, leave empty if current)"><input type="number" inputMode="numeric" min={1950} max={2100} value={row.endYear} onChange={(e) => patchExperience(row.key, { endYear: e.target.value })} placeholder="Present" className={inputClass} /></MiniField>
                  <MiniField label="What you did (optional)" className="sm:col-span-2">
                    <textarea value={row.description} maxLength={500} rows={3} onChange={(e) => patchExperience(row.key, { description: e.target.value })} placeholder="A sentence or two about your role." className={textareaClass} />
                    <CharacterCount value={row.description} max={500} />
                  </MiniField>
                </div>
              </RowCard>
            ))}
          </RowsSection>

          <RowsSection
            step={2} hidden={!show(2)} title="Qualifications" description="Degrees, certificates and results that show students what you know. Optional, up to 10."
            addLabel="Add a qualification" empty="No qualifications yet. A degree, diploma or a strong grade in a course you teach all count." count={qualifications.length}
            onAdd={() => {
              const key = nextKey();
              setJustAdded(key);
              setQualifications((rows) => [...rows, { key, name: "", issuer: "", year: "", credentialUrl: "" }]);
            }}
          >
            {qualifications.map((row, index) => (
              <RowCard key={row.key} label={`Qualification ${index + 1}`} onRemove={() => setQualifications((rows) => rows.filter((r) => r.key !== row.key))}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MiniField label="Qualification" className="sm:col-span-2"><input type="text" autoFocus={row.key === justAdded} value={row.name} maxLength={120} onChange={(e) => patchQualification(row.key, { name: e.target.value })} placeholder="e.g. BSc Computer Science (in progress)" className={inputClass} /></MiniField>
                  <MiniField label="Awarded by"><input type="text" value={row.issuer} maxLength={120} onChange={(e) => patchQualification(row.key, { issuer: e.target.value })} placeholder="e.g. University of Zambia" className={inputClass} /></MiniField>
                  <MiniField label="Year (or expected year)"><input type="number" inputMode="numeric" min={1950} max={2100} value={row.year} onChange={(e) => patchQualification(row.key, { year: e.target.value })} placeholder="e.g. 2025" className={inputClass} /></MiniField>
                  <MiniField label="Link to certificate (optional)" className="sm:col-span-2"><input type="url" value={row.credentialUrl} maxLength={300} onChange={(e) => patchQualification(row.key, { credentialUrl: e.target.value })} placeholder="https://" className={inputClass} /></MiniField>
                </div>
              </RowCard>
            ))}
          </RowsSection>

          <Card step={3} hidden={!show(3)} title="Profile visibility" description="Control who can discover your Academic Mate profile." bodyClass="grid gap-3 px-6 py-6 sm:px-8" as="fieldset">
            <legend className="sr-only">Profile visibility</legend>
            {visibilityOptions.map((option) => {
              const isSelected = profileVisibility === option.value;
              return (
                <label key={option.value} className={`relative flex cursor-pointer rounded-xl border p-4 transition-all focus-within:ring-2 focus-within:ring-[#7d1f2a]/20 ${isSelected ? "border-[#7d1f2a] bg-[#f6f1ec]/60 ring-1 ring-[#7d1f2a]" : "border-[#e2d9d0] bg-white hover:border-[#cbbfb4] hover:bg-[#faf8f6]"}`}>
                  <div className="mt-0.5 flex h-5 w-5 items-center justify-center">
                    <input type="radio" name="profileVisibility" value={option.value} checked={isSelected} onChange={() => setProfileVisibility(option.value)} className="h-4 w-4 accent-[#7d1f2a] focus:ring-[#7d1f2a]" />
                  </div>
                  <div className="ml-4 flex flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <Svg className={`h-4 w-4 ${isSelected ? "text-[#7d1f2a]" : "text-[#8a817a]"}`} d={option.icon} />
                      <span className="font-semibold text-[#241f1c]">{option.label}</span>
                    </div>
                    <span className="mt-1 text-xs leading-relaxed text-[#6b625c]">{option.description}</span>
                  </div>
                </label>
              );
            })}
          </Card>

          {!isEditing && step === 3 && (
            <section className="rounded-2xl border border-[#e2d9d0] bg-white px-6 py-5 shadow-sm sm:px-8">
              <h2 className="text-base font-bold text-[#241f1c]">Review your profile</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <Summary label="Headline" className="break-words">{headline.trim() || "—"}</Summary>
                <Summary label="Bio" className="line-clamp-3 break-words">{bio.trim() || "Not added"}</Summary>
                <Summary label="Experience">{yearsExperience.trim() ? `${yearsExperience} years` : "Years not added"} · {experiences.filter((e) => e.title.trim()).length} role(s){teachingExperience.trim() ? " · teaching experience added" : ""}</Summary>
                <Summary label="Qualifications">{qualifications.filter((q) => q.name.trim()).length} added</Summary>
                <Summary label="Visibility">{visibilityOptions.find((o) => o.value === profileVisibility)?.label}</Summary>
              </dl>
              <p className="mt-3 text-xs text-[#6b625c]">You can edit everything later, and verify your documents after creating the profile.</p>
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-12">
            {!isEditing && step > 0 ? (
              <button type="button" onClick={goBack} className={secondary}>Back</button>
            ) : (
              <Link href="/student/dashboard" className={`${secondary} focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/20`}>{isEditing ? "Back to dashboard" : "Cancel"}</Link>
            )}
            {/* Next is a submit button so Enter moves on too; distinct keys stop React reusing one button for both. */}
            {!isEditing && !isLastStep ? (
              <button key="next" type="submit" className={primary}>Next</button>
            ) : (
              <button key="submit" type="submit" disabled={busy} className={`${primary} gap-2 disabled:cursor-not-allowed disabled:opacity-60`}>
                {busy && (
                  <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {creating ? "Creating..." : saving ? "Saving..." : isEditing ? "Save changes" : "Create profile"}
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

/* Helper Components */

/** A form section with a tinted header; `as="fieldset"` makes the body a fieldset (used for the radio group). */
function Card({ step, hidden, title, description, children, as, bodyClass = "space-y-6 px-6 py-6 sm:px-8" }: { step: number; hidden?: boolean; title: string; description: string; children: React.ReactNode; as?: "fieldset"; bodyClass?: string }) {
  const Body = as ?? "div";
  return (
    <section data-step={step} hidden={hidden} className="overflow-hidden rounded-2xl border border-[#e2d9d0] bg-white shadow-sm">
      <div className="border-b border-[#e2d9d0]/70 bg-[#faf8f6] px-6 py-5 sm:px-8">
        <h2 className="text-base font-bold text-[#241f1c]">{title}</h2>
        <p className="mt-1 text-xs text-[#6b625c]">{description}</p>
      </div>
      <Body className={bodyClass}>{children}</Body>
    </section>
  );
}

function Field({ id, label, description, children }: { id: string; label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-[#302a26]">{label}</label>
      <p id={`${id}-desc`} className="text-xs text-[#746b65]">{description}</p>
      <div className="pt-1">{children}</div>
    </div>
  );
}

function Summary({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold text-[#6b625c]">{label}</dt><dd className={`text-[#241f1c] ${className}`}>{children}</dd></div>;
}

function RowsSection({ step, hidden, title, description, addLabel, empty, count, onAdd, children }: { step: number; hidden?: boolean; title: string; description: string; addLabel: string; empty: string; count: number; onAdd: () => void; children: React.ReactNode }) {
  return (
    <Card step={step} hidden={hidden} title={title} description={description} bodyClass="space-y-4 px-6 py-6 sm:px-8">
      {count === 0 ? <p className="rounded-xl border border-dashed border-[#d8cec5] px-4 py-3 text-xs text-[#6b625c]">{empty}</p> : children}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onAdd} disabled={count >= MAX_ROWS} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8cec5] bg-white px-3 py-2 text-xs font-semibold text-[#7d1f2a] transition hover:bg-[#faf0f1] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/30 disabled:cursor-not-allowed disabled:opacity-50">
          <span aria-hidden="true" className="text-base leading-none">+</span>
          {count >= MAX_ROWS ? "Limit reached" : addLabel}
        </button>
        {count > 0 && <span className="text-[11px] font-medium text-[#8a817a]">{count}/{MAX_ROWS}</span>}
      </div>
    </Card>
  );
}

function RowCard({ label, onRemove, children }: { label: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-[#e2d9d0] bg-[#fdfcfb] p-4">
      <legend className="sr-only">{label}</legend>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-[#6b625c]">{label}</span>
        <button type="button" onClick={onRemove} aria-label={`Remove ${label.toLowerCase()}`} className="rounded-md px-2 py-1 text-xs font-semibold text-[#8b2a35] transition hover:bg-[#faf0f1] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/30">Remove</button>
      </div>
      {children}
    </fieldset>
  );
}

function MiniField({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-[#302a26]">{label}</span>
      {children}
    </label>
  );
}

function CharacterCount({ value, max }: { value: string; max: number }) {
  const isNearLimit = max - value.length <= max * 0.1;
  return <p className={`mt-1 text-right text-[11px] font-medium tracking-tight ${isNearLimit ? "text-amber-600" : "text-[#8a817a]"}`}>{value.length}/{max}</p>;
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  const dot = value === "ACTIVE" || value === "VERIFIED" ? "bg-emerald-500" : value === "PENDING" || value === "UNVERIFIED" ? "bg-amber-500" : value === "REJECTED" || value === "SUSPENDED" ? "bg-red-500" : "bg-gray-400";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2d9d0] bg-white px-3 py-1 text-xs font-semibold text-[#4e4742] shadow-xs">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span>{label}:</span>
      <span className="font-bold text-[#241f1c]">{formatStatus(value)}</span>
    </span>
  );
}

function formatStatus(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

/* Shared Classes */

const inputClass = "block w-full rounded-xl border border-[#d8cec5] bg-white px-4 py-2.5 text-sm text-[#302a26] shadow-sm outline-none transition placeholder:text-[#9a918a] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/15";
const textareaClass = `${inputClass} resize-y`;