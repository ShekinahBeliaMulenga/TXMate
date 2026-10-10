"use client";

import { FormEvent, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import ImageCropModal from "@/components/ImageCropModal"; // adjust the path to where you put the file

type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";

type ProfileResponse = {
  studentProfile: {
    id: string;
    studentId: string;
    gender: "MALE" | "FEMALE";
    status: "ACTIVE" | "GRADUATED" | "SUSPENDED" | "WITHDRAWN";
    phoneNumber: string | null;
    bio: string | null;
    profileVisibility: ProfileVisibility;
    showStudentId: boolean;
    showPhoneNumber: boolean;
  };
  user: { id: string; name: string; email: string; image: string | null };
};

const visibilityOptions: Array<{ value: ProfileVisibility; label: string; description: string }> = [
  { value: "PUBLIC", label: "Public", description: "Your profile can be discovered by TXMate members." },
  { value: "MEMBERS_ONLY", label: "TXMate members", description: "Visible only to signed-in TXMate members." },
  { value: "PRIVATE", label: "Private", description: "Not available for member discovery." },
];

const iconPaths = {
  user: "M12 14.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm7.25 5.25a7.25 7.25 0 0 0-14.5 0",
  phone: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z",
  mail: "M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75",
  eye: "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  lock: "M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z",
  camera: "M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316ZM16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z",
  id: "M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z",
  edit: "M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z",
  check: "m4.5 12.75 6 6 9-13.5",
  chevronLeft: "M15.75 19.5 8.25 12l7.5-7.5",
} as const;

type IconName = keyof typeof iconPaths;

const sections: Array<{ id: string; label: string; short: string; icon: IconName }> = [
  { id: "photo", label: "Profile photo", short: "Photo", icon: "camera" },
  { id: "personal", label: "Personal information", short: "Personal", icon: "user" },
  { id: "privacy", label: "Privacy", short: "Privacy", icon: "eye" },
  { id: "account", label: "Account record", short: "Account", icon: "id" },
];

const INPUT =
  "w-full rounded-lg border border-[#d9cec5] bg-white px-3.5 py-2.5 text-sm text-[#282321] outline-none transition placeholder:text-[#a79b95] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10";
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2";

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={iconPaths[name]} />
    </svg>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

async function requestJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("The service returned an unexpected response.");

  let body: { error?: string };
  try {
    body = (await response.json()) as { error?: string };
  } catch {
    throw new Error("The service returned an unreadable response.");
  }

  if (!response.ok) throw new Error(body.error || fallback);
  return body as T;
}

async function resizeProfileImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Your browser could not prepare the selected image.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/webp", 0.86);
  if (!dataUrl.startsWith("data:image/webp;base64,")) throw new Error("Your browser could not prepare the selected image.");
  return dataUrl;
}

function Card({ id, title, subtitle, icon, children }: { id: string; title: string; subtitle: string; icon: IconName; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 overflow-hidden rounded-lg border border-[#e2d9d0] bg-white">
      <div className="flex items-center gap-3 border-b border-[#ece5de] bg-[#fbf9f7] px-5 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#7d1f2a]/10 text-[#7d1f2a]">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-sm font-semibold text-[#282321]">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-[#7a6f6a]">{subtitle}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-semibold text-[#282321]">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-[#7a6f6a]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${FOCUS} ${checked ? "bg-[#7d1f2a]" : "bg-[#d9cec5]"}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

function SectionNav({ active, onSelect, compact = false }: { active: string; onSelect: (id: string) => void; compact?: boolean }) {
  return (
    <nav aria-label="Settings sections" className={compact ? "grid grid-cols-4 gap-1" : "flex flex-col gap-1"}>
      {sections.map((section) => {
        const current = active === section.id;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={current ? "true" : undefined}
            onClick={(event) => {
              event.preventDefault();
              onSelect(section.id);
            }}
            className={`flex items-center rounded-lg font-medium transition ${FOCUS} ${
              compact ? "flex-col gap-1 px-1 py-1.5 text-[11px]" : "gap-2.5 px-3 py-2 text-sm"
            } ${current ? "bg-[#7d1f2a]/10 text-[#7d1f2a]" : "text-[#6d6260] hover:bg-white hover:text-[#282321]"}`}
          >
            <Icon name={section.icon} className="h-4 w-4" />
            {compact ? section.short : section.label}
          </a>
        );
      })}
    </nav>
  );
}

export default function StudentSettingsPage() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bio, setBio] = useState("");
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>("PUBLIC");
  const [showStudentId, setShowStudentId] = useState(false);
  const [showPhoneNumber, setShowPhoneNumber] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSuccess, setImageSuccess] = useState(false);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [activeSection, setActiveSection] = useState(sections[0].id);

  function applyProfile(data: ProfileResponse) {
    setProfile(data);
    setName(data.user.name);
    setPhoneNumber(data.studentProfile.phoneNumber ?? "");
    setBio(data.studentProfile.bio ?? "");
    setProfileVisibility(data.studentProfile.profileVisibility);
    setShowStudentId(data.studentProfile.showStudentId);
    setShowPhoneNumber(data.studentProfile.showPhoneNumber);
  }

  function validate(body: Partial<ProfileResponse>, message: string): ProfileResponse {
    if (!body.studentProfile || !body.user) throw new Error(message);
    return body as ProfileResponse;
  }

  async function loadProfile(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const body = await requestJson<Partial<ProfileResponse>>(
        "/api/student/me",
        { method: "GET", headers: { Accept: "application/json" }, cache: "no-store", signal },
        "Unable to load your profile."
      );
      applyProfile(validate(body, "The profile service returned an incomplete profile."));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unable to load your profile.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadProfile(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!profile) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" }
    );
    sections.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [profile]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(false), 4000);
    return () => window.clearTimeout(timer);
  }, [success]);

  function goToSection(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openImagePicker() {
    document.getElementById("profile-image-input")?.click();
  }

  const dirty =
    !!profile &&
    (name !== profile.user.name ||
      phoneNumber !== (profile.studentProfile.phoneNumber ?? "") ||
      bio !== (profile.studentProfile.bio ?? "") ||
      profileVisibility !== profile.studentProfile.profileVisibility ||
      showStudentId !== profile.studentProfile.showStudentId ||
      showPhoneNumber !== profile.studentProfile.showPhoneNumber);

  // Step 1: validate the chosen file, then open the crop dialog instead of uploading
  function handleProfileImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageError(null);
    setImageSuccess(false);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageError("The selected image is too large. Maximum size is 8 MB.");
      return;
    }
    setPendingFile(file);
  }

  // Step 2: upload the cropped result. On failure the dialog stays open and shows the error.
  async function uploadCroppedImage(file: File) {
    setImageError(null);
    setImageSuccess(false);
    setImageUploading(true);
    try {
      const image = await resizeProfileImage(file);
      const body = await requestJson<{ image?: string | null }>(
        "/api/student/profile-image",
        { method: "PUT", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ image }) },
        "Unable to update your profile picture."
      );
      if (typeof body.image !== "string") throw new Error("The profile image service returned an invalid image.");
      setProfile((current) => (current ? { ...current, user: { ...current.user, image: body.image ?? null } } : current));
      setImageSuccess(true);
      setPendingFile(null);
      setImageInputKey((value) => value + 1);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Unable to update your profile picture.");
    } finally {
      setImageUploading(false);
    }
  }

  function cancelCrop() {
    setPendingFile(null);
    setImageError(null);
    setImageInputKey((value) => value + 1);
  }

  async function handleRemoveProfileImage() {
    if (!profile?.user.image || imageUploading) return;
    setImageError(null);
    setImageSuccess(false);
    setImageUploading(true);
    try {
      await requestJson("/api/student/profile-image", { method: "DELETE", headers: { Accept: "application/json" } }, "Unable to remove your profile picture.");
      setProfile((current) => (current ? { ...current, user: { ...current.user, image: null } } : current));
      setImageSuccess(true);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Unable to remove your profile picture.");
    } finally {
      setImageUploading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const body = await requestJson<Partial<ProfileResponse>>(
        "/api/student/me",
        {
          method: "PATCH",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ name, phoneNumber: phoneNumber || null, bio: bio || null, profileVisibility, showStudentId, showPhoneNumber }),
        },
        "Unable to save your profile changes."
      );
      applyProfile(validate(body, "The profile service returned an incomplete saved profile."));
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save your profile changes.");
    } finally {
      setSaving(false);
    }
  }

  const pulse = "animate-pulse rounded-xl border border-[#e2d9d0] bg-white";

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f4f1ed] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="h-8 w-40 animate-pulse rounded bg-[#e8e0d8]" />
          <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className={`hidden h-48 lg:block ${pulse}`} />
            <div className="space-y-6">
              <div className={`h-40 ${pulse}`} />
              <div className={`h-80 ${pulse}`} />
              <div className={`h-72 ${pulse}`} />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error && !profile) {
    return (
      <main className="min-h-screen bg-[#f4f1ed] px-4 py-10 sm:px-6 lg:px-8">
        <div role="alert" className="mx-auto max-w-xl rounded-xl border border-[#e2d9d0] bg-white p-8 text-center">
          <h1 className="text-xl font-semibold text-[#282321]">Couldn’t load your settings</h1>
          <p className="mt-3 text-sm leading-6 text-[#6d6260]">{error}</p>
          <button type="button" onClick={() => void loadProfile()} className={`mt-6 rounded-lg bg-[#7d1f2a] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#691923] ${FOCUS}`}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!profile) return null;

  const { user, studentProfile } = profile;

  return (
    <main className="min-h-screen bg-[#f4f1ed] text-[#282321]">
      <div className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-6 lg:px-8">
        <header>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-[#6d6260]">Manage your photo, personal details and who can see them.</p>
        </header>

        <div className="sticky top-16 z-20 -mx-4 mt-4 border-b border-[#e2d9d0] bg-[#f9f8f6]/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
          <SectionNav compact active={activeSection} onSelect={goToSection} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-6">
          <div className="hidden border-r border-[#e2d9d0] pr-5 lg:block">
            <div className="sticky top-6">
              <SectionNav active={activeSection} onSelect={goToSection} />
            </div>
          </div>

          <form id="settings-form" onSubmit={handleSubmit} className="min-w-0 space-y-4">
            <Card id="photo" title="Profile photo" subtitle="Shown next to your name across TXMate." icon="camera">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  {user.image ? (
                    <img src={user.image} alt={user.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-[#f0e7e1]" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f2e9e4] text-xl font-semibold text-[#7d1f2a] ring-2 ring-[#f0e7e1]">
                      {initials(user.name)}
                    </div>
                  )}
                  <input key={imageInputKey} id="profile-image-input" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleProfileImageChange} disabled={imageUploading} />
                  <button
                    type="button"
                    onClick={openImagePicker}
                    disabled={imageUploading}
                    aria-label="Change profile picture"
                    title="Change profile picture"
                    className={`absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#7d1f2a] text-white shadow-sm hover:bg-[#691923] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`}
                  >
                    <Icon name="edit" className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[#282321]">{user.name}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={openImagePicker} disabled={imageUploading} className="text-xs font-semibold text-[#7d1f2a] hover:text-[#691923] disabled:cursor-not-allowed disabled:opacity-60">
                      {imageUploading ? "Updating..." : user.image ? "Change photo" : "Add photo"}
                    </button>
                    {user.image ? (
                      <>
                        <span className="text-xs text-[#c2b7b0]">·</span>
                        <button type="button" onClick={() => void handleRemoveProfileImage()} disabled={imageUploading} className="text-xs font-semibold text-[#8a7f7a] hover:text-[#7d1f2a] disabled:cursor-not-allowed disabled:opacity-60">
                          Remove
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              {!pendingFile && imageError ? <p role="alert" className="mt-4 text-xs leading-5 text-[#7d1f2a]">{imageError}</p> : null}
              {imageSuccess ? <p role="status" className="mt-4 text-xs leading-5 text-[#28633b]">Profile picture updated successfully.</p> : null}
            </Card>

            <Card id="personal" title="Personal information" subtitle="Details other members see on your profile." icon="user">
              <div className="space-y-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-semibold text-[#3f3734]">Full name</label>
                  <input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required className={`mt-2 ${INPUT}`} />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-semibold text-[#3f3734]">Phone number</label>
                  <div className="mt-2 flex items-center overflow-hidden rounded-lg border border-[#d9cec5] bg-white focus-within:border-[#7d1f2a] focus-within:ring-2 focus-within:ring-[#7d1f2a]/10">
                    <div className="flex items-center gap-2 border-r border-[#d9cec5] bg-[#fcfaf7] px-3.5 py-2.5 text-sm font-medium text-[#3f3734]">
                      <Icon name="phone" className="h-4 w-4 text-[#8a7f7a]" />
                      <span>+260</span>
                    </div>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="97 1234567"
                      value={phoneNumber}
                      onChange={(e) => {
                        // Digits only; drop a pasted leading 260 or 0; max 9 digits
                        const clean = e.target.value.replace(/\D/g, "").replace(/^260|^0/, "").slice(0, 9);
                        setPhoneNumber(clean);
                      }}
                      className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-sm outline-none placeholder:text-[#a79b95]"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <label htmlFor="bio" className="block text-sm font-semibold text-[#3f3734]">Bio</label>
                    <span className="text-xs text-[#7a6f6a]">{bio.length}/500</span>
                  </div>
                  <textarea id="bio" name="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={5} placeholder="Tell other TXMate members a little about yourself." className={`mt-2 resize-y leading-6 ${INPUT}`} />
                </div>
              </div>
            </Card>

            <Card id="privacy" title="Privacy" subtitle="Control what other TXMate members can see." icon="eye">
              <fieldset>
                <legend className="text-sm font-semibold text-[#3f3734]">Profile visibility</legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {visibilityOptions.map((option) => {
                    const selected = profileVisibility === option.value;
                    return (
                      <label key={option.value} className={`relative flex cursor-pointer flex-col rounded-lg border px-4 py-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#7d1f2a]/40 ${selected ? "border-[#7d1f2a] bg-[#fdf7f8]" : "border-[#e2d9d0] bg-white hover:bg-[#faf8f6]"}`}>
                        <input type="radio" name="profileVisibility" value={option.value} checked={selected} onChange={() => setProfileVisibility(option.value)} className="sr-only" />
                        <span className="flex items-center justify-between text-sm font-semibold">
                          {option.label}
                          {selected ? <Icon name="check" className="h-4 w-4 text-[#7d1f2a]" /> : null}
                        </span>
                        <span className="mt-1 text-xs leading-5 text-[#7a6f6a]">{option.description}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="mt-6 divide-y divide-[#ece5de] border-t border-[#ece5de] pt-5">
                <Toggle checked={showStudentId} onChange={setShowStudentId} label="Show Student ID" description="Let other members see your Student ID on your profile." />
                <Toggle checked={showPhoneNumber} onChange={setShowPhoneNumber} label="Show phone number" description="Let other members see your phone number on your profile." />
              </div>
            </Card>

            <Card id="account" title="Account record" subtitle="Managed by TXMate." icon="id">
              <dl className="grid gap-5 sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-xs text-[#7a6f6a]">Email address</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                    <Icon name="mail" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <span className="truncate">{user.email}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#7a6f6a]">Student ID</dt>
                  <dd className="mt-1 text-sm font-medium">{studentProfile.studentId}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#7a6f6a]">Gender</dt>
                  <dd className="mt-1 text-sm font-medium">{studentProfile.gender === "MALE" ? "Male" : "Female"}</dd>
                </div>
              </dl>
              <p className="mt-5 flex items-start gap-2 rounded-lg bg-[#f6f1ec] px-4 py-3 text-xs leading-5 text-[#6d6260]">
                <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-[#7d1f2a]" />
                Your email, university, programme, year of study and enrolled courses can’t be changed from settings.
              </p>
            </Card>
          </form>
        </div>
      </div>

      {dirty || saving ? (
        <div className="tx-savebar-enter fixed bottom-0 left-0 right-0 z-40 border-t border-[#e2d9d0] bg-white/95 shadow-[0_-8px_24px_rgba(40,35,33,0.06)] backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p role={error ? "alert" : undefined} className={`text-sm ${error ? "font-medium text-[#7d1f2a]" : "text-[#6d6260]"}`}>
              {error ?? "You have unsaved changes."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => applyProfile(profile)}
                className={`rounded-md border border-[#d9cec5] px-4 py-2 text-sm font-medium text-[#4e4742] transition hover:bg-[#faf8f6] disabled:opacity-60 ${FOCUS}`}
              >
                Discard
              </button>
              <button
                type="submit"
                form="settings-form"
                disabled={saving}
                className={`rounded-md bg-[#7d1f2a] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#691923] disabled:opacity-60 ${FOCUS}`}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {success && !dirty ? (
        <div role="status" className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[#28633b] px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <Icon name="check" className="h-4 w-4" />
          Changes saved
        </div>
      ) : null}

      {pendingFile ? (
        <ImageCropModal
          file={pendingFile}
          busy={imageUploading}
          externalError={imageError}
          onCancel={cancelCrop}
          onConfirm={(cropped) => void uploadCroppedImage(cropped)}
        />
      ) : null}
    </main>
  );
}