"use client";

import type { usePhoneAvailability } from "./use-phone-availability";
import PhoneField from "@/components/ui/phone-field";
import { PHONE_FORMAT_MESSAGE, PHONE_TAKEN_MESSAGE } from "@/lib/phone";
import type { SettingsFormValues } from "./settings-types";
import { HINT, Icon, INPUT, INPUT_READONLY, LABEL } from "./settings-ui";

type Props = {
  email: string;
  values: Pick<SettingsFormValues, "name" | "phoneCountry" | "phoneNumber" | "bio">;
  onChange: (patch: Partial<SettingsFormValues>) => void;
  phone: ReturnType<typeof usePhoneAvailability>;
};

const BIO_MAX = 500;

/** Name, email (read only), phone and bio. Pure presentation: the page owns the values. */
export default function PersonalInfoSection({ email, values, onChange, phone }: Props) {
  const phoneInvalid = phone.taken || phone.formatError;
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="settings-name" className={LABEL}>Full name</label>
        <input id="settings-name" name="name" value={values.name} onChange={(event) => onChange({ name: event.target.value })} autoComplete="name" maxLength={100} required className={`mt-2 ${INPUT}`} />
      </div>

      <div>
        <label htmlFor="settings-email" className={LABEL}>Email address</label>
        <input id="settings-email" type="email" value={email} readOnly disabled className={`mt-2 ${INPUT_READONLY}`} />
        <p className={HINT}>To change your email address, open Email and sign-in.</p>
      </div>

      <div>
        <label htmlFor="settings-phone" className={LABEL}>Phone number</label>
        <div className="mt-2">
          <PhoneField
            id="settings-phone"
            country={values.phoneCountry}
            national={values.phoneNumber}
            onChange={(value) => onChange({ phoneCountry: value.country, phoneNumber: value.national })}
            invalid={phoneInvalid}
            describedBy="settings-phone-hint"
          />
        </div>
        <div id="settings-phone-hint" className="min-h-5">
          {phone.taken ? (
            <p role="alert" className="mt-1.5 text-xs leading-5 text-[#7d1f2a]">{PHONE_TAKEN_MESSAGE}</p>
          ) : phone.formatError ? (
            <p role="alert" className="mt-1.5 text-xs leading-5 text-[#7d1f2a]">{PHONE_FORMAT_MESSAGE}</p>
          ) : phone.checking ? (
            <p role="status" className={HINT}>Checking availability…</p>
          ) : phone.available ? (
            <p role="status" className="mt-1.5 text-xs leading-5 text-[#28633b]">This number is available.</p>
          ) : (
            <p className={HINT}>Choose your country, then enter your number. Zambia is selected by default.</p>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="settings-bio" className={LABEL}>Bio</label>
          <span className="text-xs tabular-nums text-[#7a6f6a]">{values.bio.length}/{BIO_MAX}</span>
        </div>
        <textarea id="settings-bio" name="bio" value={values.bio} onChange={(event) => onChange({ bio: event.target.value })} maxLength={BIO_MAX} rows={5} placeholder="Tell other TXMate members a little about yourself." className={`mt-2 resize-y leading-6 ${INPUT}`} />
      </div>
    </div>
  );
}
