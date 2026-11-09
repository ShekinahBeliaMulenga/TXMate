"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import AccountSection from "@/components/student/settings/account-section";
import EmailSection from "@/components/student/settings/email-section";
import NotificationsSection from "@/components/student/settings/notifications-section";
import PasswordSection from "@/components/student/settings/password-section";
import PersonalInfoSection from "@/components/student/settings/personal-info-section";
import PrivacySection from "@/components/student/settings/privacy-section";
import ProfilePhotoSection from "@/components/student/settings/profile-photo-section";
import { PHONE_FORMAT_MESSAGE, PHONE_TAKEN_MESSAGE, splitPhone } from "@/lib/phone";
import { requestJson } from "@/components/student/settings/settings-api";
import { isSettingsSectionId, SETTINGS_SECTIONS, type SettingsSectionId } from "@/components/student/settings/settings-config";
import SettingsMenu from "@/components/student/settings/settings-menu";
import SettingsSaveActions from "@/components/student/settings/settings-save-actions";
import type { ProfileResponse, SettingsFormValues } from "@/components/student/settings/settings-types";
import { FOCUS, Icon, ScreenHeading } from "@/components/student/settings/settings-ui";
import { usePhoneAvailability } from "@/components/student/settings/use-phone-availability";

const DEFAULT_SECTION: SettingsSectionId = SETTINGS_SECTIONS[0].id;

function valuesFromProfile(data: ProfileResponse): SettingsFormValues {
  return {
    name: data.user.name,
    phoneCountry: splitPhone(data.studentProfile.phoneNumber).country,
    phoneNumber: splitPhone(data.studentProfile.phoneNumber).national,
    bio: data.studentProfile.bio ?? "",
    profileVisibility: data.studentProfile.profileVisibility,
    showStudentId: data.studentProfile.showStudentId,
    showPhoneNumber: data.studentProfile.showPhoneNumber,
  };
}

const EMPTY_VALUES: SettingsFormValues = { name: "", phoneCountry: "ZM", phoneNumber: "", bio: "", profileVisibility: "PUBLIC", showStudentId: false, showPhoneNumber: false };

function readSectionFromHash(): SettingsSectionId | null {
  const id = window.location.hash.replace(/^#/, "");
  return isSettingsSectionId(id) ? id : null;
}

export default function StudentSettingsPage() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [values, setValues] = useState<SettingsFormValues>(EMPTY_VALUES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  /** The open screen. `null` shows the menu on phones; desktop falls back to the first screen. */
  const [section, setSection] = useState<SettingsSectionId | null>(null);

  const applyProfile = useCallback((data: ProfileResponse) => {
    setProfile(data);
    setValues(valuesFromProfile(data));
  }, []);

  const loadProfile = useCallback(async (signal?: AbortSignal, showLoader = true, clearError = true) => {
    if (showLoader) setLoading(true);
    if (clearError) setError(null);
    try {
      const body = await requestJson<Partial<ProfileResponse>>(
        "/api/student/me",
        { method: "GET", headers: { Accept: "application/json" }, cache: "no-store", signal },
        "Unable to load your profile."
      );
      if (!body.studentProfile || !body.user) throw new Error("The profile service returned an incomplete profile.");
      applyProfile(body as ProfileResponse);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unable to load your profile.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [applyProfile]);

  useEffect(() => {
    const controller = new AbortController();
    void loadProfile(controller.signal, false, false);
    return () => controller.abort();
  }, [loadProfile]);

  // The open screen lives in the URL hash so the browser and phone Back buttons return to the menu.
  useEffect(() => {
    const sync = () => setSection(readSectionFromHash());
    sync(); // eslint-disable-line react-hooks/set-state-in-effect
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [section]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(false), 4000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const phone = usePhoneAvailability(values.phoneCountry, values.phoneNumber, profile?.studentProfile.phoneNumber ?? null);

  const updateValues = useCallback((patch: Partial<SettingsFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setError(null);
  }, []);

  const openSection = (id: SettingsSectionId) => {
    window.location.hash = id;
  };

  const closeSection = () => {
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}`);
    setSection(null);
  };

  const dirty = (() => {
    if (!profile) return false;
    const saved = valuesFromProfile(profile);
    // The phone is compared as a number, so typing the same number another way is not a change.
    return (Object.keys(saved) as Array<keyof SettingsFormValues>).some((key) => key === "phoneCountry" || key === "phoneNumber" ? false : saved[key] !== values[key]) || phone.changed;
  })();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setError(null);
    setSuccess(false);
    if (phone.formatError) {
      setError(PHONE_FORMAT_MESSAGE);
      return;
    }
    if (phone.taken) {
      setError(PHONE_TAKEN_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      const body = await requestJson<Partial<ProfileResponse>>(
        "/api/student/me",
        {
          method: "PATCH",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            phoneNumber: phone.untouched ? (profile.studentProfile.phoneNumber ?? null) : (values.phoneNumber ? phone.e164 : null),
            bio: values.bio || null,
            profileVisibility: values.profileVisibility,
            showStudentId: values.showStudentId,
            showPhoneNumber: values.showPhoneNumber,
          }),
        },
        "Unable to save your profile changes."
      );
      if (!body.studentProfile || !body.user) throw new Error("The profile service returned an incomplete saved profile.");
      applyProfile(body as ProfileResponse);
      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save your profile changes.";
      // Someone registered this number after the live check ran.
      if (message.toLowerCase().includes("phone number is already registered")) phone.markTaken(phone.e164);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  const page = "min-h-screen bg-[#f4f1ed] text-[#282321]";
  const pad = "mx-auto max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-6 lg:px-12 lg:pb-14 lg:pt-10";
  const pulse = "animate-pulse rounded-2xl bg-white";

  if (loading) {
    return (
      <main className={page}>
        <div className={pad}>
          <div className="h-8 w-40 animate-pulse rounded bg-[#e8e0d8]" />
          <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-[#eee7df]" />
          <div className={`mt-6 h-[26rem] ${pulse}`} />
        </div>
      </main>
    );
  }

  if (error && !profile) {
    return (
      <main className={page}>
        <div className={pad}>
          <div role="alert" className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-[#282321]">Couldn’t load your settings</h1>
            <p className="mt-3 text-sm leading-6 text-[#6d6260]">{error}</p>
            <button type="button" onClick={() => void loadProfile()} className={`mt-6 rounded-xl bg-[#7d1f2a] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#681923] ${FOCUS}`}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!profile) return null;

  const { user, studentProfile } = profile;
  const activeId = section ?? DEFAULT_SECTION;
  const active = SETTINGS_SECTIONS.find((item) => item.id === activeId) ?? SETTINGS_SECTIONS[0];

  const formActions = (
    <SettingsSaveActions dirty={dirty} saving={saving} blocked={phone.taken || phone.formatError} error={error} onDiscard={() => { applyProfile(profile); setError(null); }} />
  );

  function renderScreen() {
    switch (active.id) {
      case "photo":
        return (
          <ProfilePhotoSection
            name={user.name}
            image={user.image}
            onImageChange={(image) => setProfile((current) => (current ? { ...current, user: { ...current.user, image } } : current))}
          />
        );
      case "personal":
        return (
          <form onSubmit={handleSubmit}>
            <PersonalInfoSection email={user.email} values={values} onChange={updateValues} phone={phone} />
            {formActions}
          </form>
        );
      case "privacy":
        return (
          <form onSubmit={handleSubmit}>
            <PrivacySection values={values} onChange={updateValues} />
            {formActions}
          </form>
        );
      case "account":
        return <AccountSection studentProfile={studentProfile} />;
      case "email":
        return <EmailSection email={user.email} />;
      case "security":
        return <PasswordSection />;
      case "notifications":
        return <NotificationsSection />;
    }
  }

  return (
    <main className={page}>
      <div className={pad}>
        <div className="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-0">
          <div className={`${section ? "hidden lg:block" : "block"} lg:sticky lg:top-10 lg:pr-10`}>
            <ScreenHeading title="Settings" subtitle="Manage your account, profile and preferences." />
            <div className="mt-4">
              <SettingsMenu activeId={activeId} onSelect={openSection} />
            </div>
          </div>

          <div className={`${section ? "block" : "hidden lg:block"} min-w-0 max-w-2xl lg:pl-12`}>
            <div className="mb-3 lg:hidden">
              <button
                type="button"
                onClick={closeSection}
                aria-label="Back to settings"
                title="Back to settings"
                className={`-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-[#7d1f2a] transition hover:bg-[#7d1f2a]/10 ${FOCUS}`}
              >
                <Icon name="chevronLeft" className="h-6 w-6" />
              </button>
            </div>
            <ScreenHeading title={active.label} subtitle={active.intro} />
            <div className="mt-4 sm:mt-5">{renderScreen()}</div>
          </div>
        </div>
      </div>

      {success && !dirty ? (
        <div role="status" className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#28633b] px-4 py-2.5 text-sm font-medium text-white shadow-lg lg:bottom-5">
          <Icon name="check" className="h-4 w-4" />
          Changes saved
        </div>
      ) : null}
    </main>
  );
}