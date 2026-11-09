/**
 * Rules for the documents an Academic Mate uploads to prove who they are. Pure functions, so they can be tested
 * on their own; the routes add the database, storage and sign-in checks.
 */
export const EVIDENCE_KINDS = ["STUDENT_ID", "NATIONAL_ID", "PASSPORT", "PROOF_OF_ENROLMENT", "ACADEMIC_RESULTS"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export type EvidenceReview = "PENDING" | "ACCEPTED" | "REJECTED";

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  STUDENT_ID: "Student ID card",
  NATIONAL_ID: "National Registration Card (NRC)",
  PASSPORT: "Passport",
  PROOF_OF_ENROLMENT: "Proof of enrolment",
  ACADEMIC_RESULTS: "Academic results",
};
export const EVIDENCE_HINT: Record<EvidenceKind, string> = {
  STUDENT_ID: "A clear photo of the front of your university student ID card.",
  NATIONAL_ID: "A clear photo of the front and back of your NRC.",
  PASSPORT: "A clear photo of the page with your photo and name.",
  PROOF_OF_ENROLMENT: "A registration slip, fee statement or enrolment letter for this year.",
  ACADEMIC_RESULTS: "A recent statement of results or transcript.",
};

/** Any one of these proves who the person is. */
export const IDENTITY_KINDS: EvidenceKind[] = ["STUDENT_ID", "NATIONAL_ID", "PASSPORT"];
/** Either of these proves they study at the university. */
export const PROOF_KINDS: EvidenceKind[] = ["PROOF_OF_ENROLMENT", "ACADEMIC_RESULTS"];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PER_KIND = 2;
export const MAX_TOTAL = 6;
export const ADMIN_LINK_SECONDS = 60;
/** How long files are kept after a decision before the clean-up script deletes them. */
export const KEEP_DAYS_AFTER_APPROVAL = 14;
export const KEEP_DAYS_AFTER_REJECTION = 14;

export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AllowedType = (typeof ALLOWED_TYPES)[number];
const EXTENSION: Record<AllowedType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export function isEvidenceKind(value: unknown): value is EvidenceKind {
  return typeof value === "string" && (EVIDENCE_KINDS as readonly string[]).includes(value);
}

/** What the file really is, from its first bytes. The name and the type the browser claims are never trusted. */
export function sniffContentType(bytes: Uint8Array): AllowedType | null {
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (bytes.length >= 12 && starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  return null;
}

export const extensionFor = (type: AllowedType) => EXTENSION[type];
/** A random, unguessable key that carries no name or personal detail. */
export const storageKeyFor = (profileId: string, evidenceId: string, type: AllowedType) => `verification/${profileId}/${evidenceId}.${EXTENSION[type]}`;

export type EvidenceLike = { kind: EvidenceKind; reviewStatus: EvidenceReview };

/** What is still missing before the application can be submitted. Rejected files do not count. */
export function missingForSubmission(items: EvidenceLike[]): string[] {
  const usable = items.filter((item) => item.reviewStatus !== "REJECTED");
  const missing: string[] = [];
  if (!usable.some((item) => IDENTITY_KINDS.includes(item.kind))) missing.push("a photo of your student ID card, NRC or passport");
  if (!usable.some((item) => PROOF_KINDS.includes(item.kind))) missing.push("proof of enrolment or your academic results");
  return missing;
}

/** What stops an admin from approving: every file must be reviewed, one identity document and one proof must be accepted. */
export function blockersForApproval(items: EvidenceLike[]): string[] {
  const blockers: string[] = [];
  if (items.some((item) => item.reviewStatus === "PENDING")) blockers.push("Some documents have not been reviewed yet.");
  if (!items.some((item) => IDENTITY_KINDS.includes(item.kind) && item.reviewStatus === "ACCEPTED")) blockers.push("No identity document (student ID, NRC or passport) has been accepted.");
  if (!items.some((item) => PROOF_KINDS.includes(item.kind) && item.reviewStatus === "ACCEPTED")) blockers.push("Neither proof of enrolment nor academic results has been accepted.");
  return blockers;
}

export function purgeDate(decision: "VERIFIED" | "REJECTED", decidedAt: Date): Date {
  const days = decision === "VERIFIED" ? KEEP_DAYS_AFTER_APPROVAL : KEEP_DAYS_AFTER_REJECTION;
  return new Date(decidedAt.getTime() + days * 24 * 3600 * 1000);
}

/** Preset reasons an admin can pick when rejecting a document. */
export const REJECTION_REASONS = [
  "The photo is blurry or cut off",
  "The document is expired or out of date",
  "The name does not match the profile",
  "This is not the document type requested",
  "The document looks edited or unreadable",
] as const;

export const EXCEPTION_REASON_MIN = 20;
export const EXCEPTION_REASON_MAX = 1000;
/** Only a platform admin may approve while documents are missing, and must say why in writing. Returns the problem, or null when fine. */
export function exceptionProblem(role: string, reason: unknown): string | null {
  if (role !== "PLATFORM_ADMIN") return "Only a platform admin can approve without the required documents.";
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < EXCEPTION_REASON_MIN) return `Explain the exception in at least ${EXCEPTION_REASON_MIN} characters.`;
  if (text.length > EXCEPTION_REASON_MAX) return `The reason cannot exceed ${EXCEPTION_REASON_MAX} characters.`;
  return null;
}
