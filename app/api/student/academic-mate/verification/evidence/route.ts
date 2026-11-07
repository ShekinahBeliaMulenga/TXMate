import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2Object, uploadR2Object } from "@/lib/r2";
import { MAX_FILE_BYTES, MAX_PER_KIND, MAX_TOTAL, isEvidenceKind, sniffContentType, storageKeyFor } from "@/lib/verification-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

/** Uploads one identity document (multipart: kind, file). Allowed while the application is not being reviewed. */
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return fail("You must be signed in.", 401);
    // Reject oversized uploads before reading them into memory.
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_FILE_BYTES + 200 * 1024) return fail("That file is too large. The limit is 5 MB.", 413);

    let form: FormData;
    try { form = await request.formData(); } catch { return fail("Send the document as a file upload.", 400); }
    const kind = form.get("kind");
    const file = form.get("file");
    if (!isEvidenceKind(kind)) return fail("Choose which document this is.", 400);
    if (!(file instanceof File) || file.size === 0) return fail("Choose a file to upload.", 400);
    if (file.size > MAX_FILE_BYTES) return fail("That file is too large. The limit is 5 MB.", 413);

    const profile = await prisma.academicMateProfile.findUnique({
      where: { userId },
      select: { id: true, status: true, verificationStatus: true, evidence: { select: { kind: true, sha256: true } } },
    });
    if (!profile) return fail("Academic Mate profile not found.", 404);
    if (profile.status !== "ACTIVE") return fail("Only an active Academic Mate profile can upload documents.", 400);
    if (profile.verificationStatus === "PENDING") return fail("Your application is being reviewed, so documents cannot be changed now.", 409);
    if (profile.verificationStatus === "VERIFIED") return fail("Your profile is already verified.", 409);
    if (profile.evidence.length >= MAX_TOTAL) return fail(`You can upload up to ${MAX_TOTAL} documents. Delete one first.`, 409);
    if (profile.evidence.filter((item) => item.kind === kind).length >= MAX_PER_KIND) return fail(`You can upload up to ${MAX_PER_KIND} files for this document. Delete one first.`, 409);

    const bytes = new Uint8Array(await file.arrayBuffer());
    // The real file type comes from its contents, not from its name or what the browser says.
    const type = sniffContentType(bytes);
    if (!type) return fail("Upload a JPG, PNG, WebP or PDF file.", 400);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (profile.evidence.some((item) => item.sha256 === sha256)) return fail("You have already uploaded this exact file.", 409);

    const id = randomUUID();
    const storageKey = storageKeyFor(profile.id, id, type);
    await uploadR2Object(storageKey, bytes, type);
    try {
      const created = await prisma.academicMateEvidence.create({
        data: { id, academicMateProfileId: profile.id, kind, storageKey, contentType: type, sizeBytes: bytes.length, sha256 },
        select: { id: true, kind: true, contentType: true, sizeBytes: true, reviewStatus: true, rejectionReason: true, createdAt: true },
      });
      return NextResponse.json({ evidence: { ...created, createdAt: created.createdAt.toISOString() } }, { status: 201, headers: NO_STORE });
    } catch (error) {
      // Never leave a stored document that nothing points to.
      await deleteR2Object(storageKey).catch((cleanup) => console.error("Could not remove an orphaned document:", cleanup));
      throw error;
    }
  } catch (error) {
    console.error("POST /api/student/academic-mate/verification/evidence failed:", error);
    return fail("We could not upload that document. Try again.", 500);
  }
}
