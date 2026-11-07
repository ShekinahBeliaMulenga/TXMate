import { describe, expect, test } from "bun:test";
import { blockersForApproval, extensionFor, isEvidenceKind, missingForSubmission, purgeDate, sniffContentType, storageKeyFor } from "../lib/verification-evidence";

const bytes = (...values: number[]) => new Uint8Array([...values, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("file type detection", () => {
  test("recognises the allowed types from their first bytes", () => {
    expect(sniffContentType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffContentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffContentType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffContentType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe("application/pdf");
  });

  test("refuses everything else, including scripts and executables renamed to look harmless", () => {
    expect(sniffContentType(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
    expect(sniffContentType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(sniffContentType(bytes(0x4d, 0x5a))).toBeNull();
    expect(sniffContentType(new Uint8Array([]))).toBeNull();
    expect(sniffContentType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
  });

  test("the stored key carries no personal detail and keeps the real extension", () => {
    const key = storageKeyFor("profile-1", "file-1", "application/pdf");
    expect(key).toBe("verification/profile-1/file-1.pdf");
    expect(extensionFor("image/jpeg")).toBe("jpg");
  });

  test("only the three document kinds are accepted", () => {
    expect(isEvidenceKind("STUDENT_ID")).toBe(true);
    expect(isEvidenceKind("OTHER")).toBe(false);
    expect(isEvidenceKind(undefined)).toBe(false);
  });
});

describe("what is needed to apply", () => {
  test("an ID and one proof are required, and rejected files do not count", () => {
    expect(missingForSubmission([])).toHaveLength(2);
    expect(missingForSubmission([{ kind: "STUDENT_ID", reviewStatus: "PENDING" }])).toHaveLength(1);
    expect(missingForSubmission([{ kind: "STUDENT_ID", reviewStatus: "PENDING" }, { kind: "ACADEMIC_RESULTS", reviewStatus: "PENDING" }])).toEqual([]);
    expect(missingForSubmission([{ kind: "STUDENT_ID", reviewStatus: "REJECTED" }, { kind: "PROOF_OF_ENROLMENT", reviewStatus: "ACCEPTED" }])).toHaveLength(1);
  });
});

describe("what an admin needs before approving", () => {
  test("every file reviewed, the ID accepted and one proof accepted", () => {
    expect(blockersForApproval([])).toHaveLength(2);
    expect(blockersForApproval([{ kind: "STUDENT_ID", reviewStatus: "ACCEPTED" }, { kind: "PROOF_OF_ENROLMENT", reviewStatus: "ACCEPTED" }])).toEqual([]);
    expect(blockersForApproval([{ kind: "STUDENT_ID", reviewStatus: "ACCEPTED" }, { kind: "PROOF_OF_ENROLMENT", reviewStatus: "PENDING" }])).toContain("Some documents have not been reviewed yet.");
    expect(blockersForApproval([{ kind: "STUDENT_ID", reviewStatus: "REJECTED" }, { kind: "ACADEMIC_RESULTS", reviewStatus: "ACCEPTED" }])).toContain("The student ID has not been accepted.");
  });

  test("a rejected extra file does not block when the required ones are accepted", () => {
    expect(blockersForApproval([
      { kind: "STUDENT_ID", reviewStatus: "ACCEPTED" }, { kind: "ACADEMIC_RESULTS", reviewStatus: "ACCEPTED" }, { kind: "PROOF_OF_ENROLMENT", reviewStatus: "REJECTED" },
    ])).toEqual([]);
  });
});

describe("keeping documents", () => {
  test("they are kept 14 days after approval or rejection", () => {
    const decided = new Date("2026-11-03T10:00:00.000Z");
    expect(purgeDate("VERIFIED", decided).toISOString()).toBe("2026-11-17T10:00:00.000Z");
    expect(purgeDate("REJECTED", decided).toISOString()).toBe("2026-11-17T10:00:00.000Z");
  });
});
