import type { IconName } from "./settings-ui";

export type SettingsSectionId = "photo" | "personal" | "privacy" | "account" | "email" | "security" | "notifications";

export type SettingsSection = {
  id: SettingsSectionId;
  /** Menu row title and screen heading. */
  label: string;
  /** Menu row subtitle. */
  description: string;
  /** Screen subtitle. */
  intro: string;
  icon: IconName;
};

/** Single source of truth for the settings menu and every screen heading. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: "photo", label: "Profile photo", description: "Change your profile photo", intro: "Choose a clear photo to help other TXMate members recognise you.", icon: "camera" },
  { id: "personal", label: "Personal information", description: "Name, email, phone and bio", intro: "Keep your information up to date.", icon: "user" },
  { id: "privacy", label: "Privacy", description: "Profile visibility and contact details", intro: "Control who can see your profile and contact details.", icon: "eye" },
  { id: "account", label: "Account record", description: "Student ID and academic information", intro: "Your student record and account status.", icon: "id" },
  { id: "email", label: "Email and sign-in", description: "Change your email, connect Google", intro: "Change your email address and choose how you sign in.", icon: "key" },
  { id: "security", label: "Password", description: "Change or set your password", intro: "Keep your account secure with a strong password.", icon: "lock" },
  { id: "notifications", label: "Notifications", description: "Manage your notification preferences", intro: "Choose how TXMate reaches you.", icon: "bell" },
];

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}
