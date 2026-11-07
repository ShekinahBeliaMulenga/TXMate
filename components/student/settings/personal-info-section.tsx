"use client";

import type { usePhoneAvailability } from "./use-phone-availability";
import { cleanPhoneInput, PHONE_FORMAT_MESSAGE, PHONE_TAKEN_MESSAGE } from "./phone";
import type { SettingsFormValues } from "./settings-types";
import { HINT, Icon, INPUT, INPUT_READONLY, LABEL } from "./settings-ui";

type Props = {
  email: string;
  values: Pick<SettingsFormValues, "name" | "phoneNumber" | "bio">;
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
        <div className={`mt-2 flex items-center overflow-hidden rounded-xl border bg-white focus-within:ring-2 ${phoneInvalid ? "border-[#7d1f2a] focus-within:ring-[#7d1f2a]/10" : "border-[#ded3ca] focus-within:border-[#7d1f2a] focus-within:ring-[#7d1f2a]/10"}`}>
          <div className="flex items-center gap-2 border-r border-[#ded3ca] bg-[#fcfaf7] px-4 py-3 text-sm font-medium text-[#3f3734]">
            <Icon name="phone" className="h-4 w-4 text-[#8a7f7a]" />
            <span>+260</span>
          </div>
          <input
            id="settings-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="97 1234567"
            value={values.phoneNumber}
            aria-invalid={phoneInvalid}
            aria-describedby="settings-phone-hint"
            onChange={(event) => onChange({ phoneNumber: cleanPhoneInput(event.target.value) })}
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[#a79b95]"
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
            <p className={HINT}>Enter a valid Zambian mobile number, for example 97 123 4567.</p>
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
