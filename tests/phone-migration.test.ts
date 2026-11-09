import { describe, expect, test } from "bun:test";
import { planPhoneNormalization } from "../lib/phone-migration";

// A stand-in for the real normaliser: Zambian numbers only, in the older formats.
const normalize = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("260") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[79]\d{8}$/.test(local) ? `+260${local}` : null;
};

describe("phone number conversion plan", () => {
  test("older formats are converted and correct rows are left alone", () => {
    const plan = planPhoneNormalization([
      { id: "a", phoneNumber: "0971234567" },
      { id: "b", phoneNumber: "+260961234567" },
      { id: "c", phoneNumber: "260951234567" },
    ], normalize);
    expect(plan.updates).toEqual([{ id: "a", from: "0971234567", to: "+260971234567" }, { id: "c", from: "260951234567", to: "+260951234567" }]);
    expect(plan.alreadyNormalised).toBe(1);
    expect(plan.conflicts).toEqual([]);
  });
  test("two rows that are the same number are a conflict and neither is changed", () => {
    const plan = planPhoneNormalization([{ id: "a", phoneNumber: "0971234567" }, { id: "b", phoneNumber: "+260971234567" }, { id: "c", phoneNumber: "971234567" }], normalize);
    expect(plan.updates).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(plan.alreadyNormalised).toBe(0);
  });
  test("unreadable numbers are reported and left alone", () => {
    const plan = planPhoneNormalization([{ id: "a", phoneNumber: "12345" }], normalize);
    expect(plan.unreadable).toEqual([{ id: "a", phoneNumber: "12345" }]);
    expect(plan.updates).toEqual([]);
  });
  test("running it again on converted data changes nothing", () => {
    const first = planPhoneNormalization([{ id: "a", phoneNumber: "0971234567" }], normalize);
    const second = planPhoneNormalization(first.updates.map((item) => ({ id: item.id, phoneNumber: item.to })), normalize);
    expect(second.updates).toEqual([]);
    expect(second.alreadyNormalised).toBe(1);
  });
});
