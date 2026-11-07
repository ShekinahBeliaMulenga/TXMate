import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2Object } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

/** Deletes one of the signed-in person's own documents, from storage and the database. Not while it is being reviewed. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ evidenceId: string }> }) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return fail("You must be signed in.", 401);
    const { evidenceId } = await params;
    const evidence = await prisma.academicMateEvidence.findFirst({
      where: { id: evidenceId, academicMateProfile: { userId } },
      select: { id: true, storageKey: true, academicMateProfile: { select: { verificationStatus: true } } },
    });
    if (!evidence) return fail("Document not found.", 404);
    if (evidence.academicMateProfile.verificationStatus === "PENDING") return fail("Your application is being reviewed, so documents cannot be changed now.", 409);
    // Remove the stored file first. If that fails the row stays, so the file is never left without an owner.
    await deleteR2Object(evidence.storageKey);
    await prisma.academicMateEvidence.deleteMany({ where: { id: evidence.id } });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("DELETE /api/student/academic-mate/verification/evidence failed:", error);
    return fail("We could not delete that document. Try again.", 500);
  }
}
