import { describe, expect, test } from "bun:test";
import { cleanSettings, normalizeCode, slugFromCode, validateCode, validateEmailDomain, validateName, validateStudentIdPattern } from "../lib/admin/university-rules";

describe("university rules", () => {
  test("codes are normalised and validated", () => {
    expect(normalizeCode(" cbu ")).toBe("CBU");
    expect(slugFromCode("CBU")).toBe("cbu");
    expect(validateCode("cbu")).toBeNull();
    expect(validateCode("C")).not.toBeNull();
    expect(validateCode("C B U")).not.toBeNull();
    expect(validateCode("TOOLONGCODE123")).not.toBeNull();
  });

  test("names must be a sensible length", () => {
    expect(validateName("Copperbelt University")).toBeNull();
    expect(validateName("ab")).not.toBeNull();
    expect(validateName("x".repeat(121))).not.toBeNull();
  });

  test("student ID patterns must compile and must not be catastrophic", () => {
    expect(validateStudentIdPattern("^\\d{8}$")).toBeNull();
    expect(validateStudentIdPattern("^[A-Z]{3}\\d{5}$")).toBeNull();
    expect(validateStudentIdPattern("(")).not.toBeNull();
    expect(validateStudentIdPattern("(a+)+$")).not.toBeNull();
    expect(validateStudentIdPattern("(.*)*")).not.toBeNull();
    expect(validateStudentIdPattern("a".repeat(121))).not.toBeNull();
  });

  test("email domains", () => {
    expect(validateEmailDomain("cbu.ac.zm")).toBeNull();
    expect(validateEmailDomain("cbu")).not.toBeNull();
    expect(validateEmailDomain("a b.com")).not.toBeNull();
  });

  test("cleanSettings validates only what was sent", () => {
    expect(cleanSettings({})).toEqual({ ok: true, value: {} });
    expect(cleanSettings({ studentIdMinLength: 8, studentIdMaxLength: 8 })).toEqual({ ok: true, value: { studentIdMinLength: 8, studentIdMaxLength: 8 } });
    expect(cleanSettings({ studentIdMinLength: 9, studentIdMaxLength: 8 }).ok).toBe(false);
    expect(cleanSettings({ studentIdMinLength: 0 }).ok).toBe(false);
    expect(cleanSettings({ studentIdMinLength: "8" }).ok).toBe(false);
    expect(cleanSettings({ studentIdPrefix: "  " })).toEqual({ ok: true, value: { studentIdPrefix: null } });
    expect(cleanSettings({ studentIdPattern: "(a+)+" }).ok).toBe(false);
    expect(cleanSettings({ universityEmailDomain: "CBU.AC.ZM" })).toEqual({ ok: true, value: { universityEmailDomain: "cbu.ac.zm" } });
    expect(cleanSettings({ requireUniversityEmail: "yes" }).ok).toBe(false);
  });
});
