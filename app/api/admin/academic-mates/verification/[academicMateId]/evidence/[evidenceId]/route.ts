import { NextResponse } from "next/server";
import { authorizeAdmin, type AdminContext } from "@/lib/admin/guard";
import { recordAudit } from "@/lib/admin/audit";
import { canAccessUniversity } from "@/lib/admin/permissions";
import { prisma } from "@/lib/prisma";
import { getR2PrivateUrl } from "@/lib/r2";
import { ADMIN_LINK_SECONDS, EVIDENCE_LABEL } from "@/lib/verification-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ academicMateId: string; evidenceId: string }> };

/** Loads the document with its owner, and refuses when this admin may not touch it. Returns the response to send on refusal. */
async function load(admin: AdminContext, academicMateId: string, evidenceId: string) {
  const evidence = await prisma.academicMateEvidence.findFirst({
    where: { id: evidenceId, academicMateProfileId: academicMateId },
    select: {
      id: true, kind: true, storageKey: true, contentType: true, reviewStatus: true,
      academicMateProfile: { select: { id: true, userId: true, universityId: true, verificationStatus: true } },
    },
  });
  if (!evidence) return { error: NextResponse.json({ error: "Document not found." }, { status: 404, headers: NO_STORE }) };
  const owner = evidence.academicMateProfile;
  if (!canAccessUniversity(admin.scope, owner.universityId)) return { error: NextResponse.json({ error: "You do not have access to this university's records." }, { status: 403, headers: NO_STORE }) };
  // An admin who is also the applicant must not open or judge their own documents.
  if (owner.userId === admin.userId) return { error: NextResponse.json({ error: "This is your own application, so another admin has to review it." }, { status: 403, headers: NO_STORE }) };
  return { evidence, owner };
}

/** A link that opens the document for a minute. Every link handed out is written to the audit log. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await authorizeAdmin("verification:review");
    if (!auth.ok) return auth.response;
    const { academicMateId, evidenceId } = await params;
    const found = await load(auth.admin, academicMateId, evidenceId);
    if (found.error) return found.error;
    const { evidence, owner } = found;
    const url = await getR2PrivateUrl(evidence.storageKey, ADMIN_LINK_SECONDS, evidence.contentType);
    await recordAudit(prisma, {
      actor: auth.admin, action: "VERIFICATION_EVIDENCE_VIEWED", targetType: "ACADEMIC_MATE", targetId: owner.id, universityId: owner.universityId,
      summary: `Opened a ${EVIDENCE_LABEL[evidence.kind].toLowerCase()}`, metadata: { evidenceId: evidence.id, kind: evidence.kind }, context: auth.context,
    });
    return NextResponse.json({ url, expiresInSeconds: ADMIN_LINK_SECONDS }, { headers: NO_STORE });
  } catch (error) {
    console.error("GET evidence link failed:", error);
    return NextResponse.json({ error: "Unable to open this document right now." }, { status: 500, headers: NO_STORE });
  }
}

/** { decision: "ACCEPTED" | "REJECTED", reason?: string }. Only while the application is waiting for review. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await authorizeAdmin("verification:review");
    if (!auth.ok) return auth.response;
    const { academicMateId, evidenceId } = await params;
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Send a valid request." }, { status: 400, headers: NO_STORE }); }
    const input = (body ?? {}) as Record<string, unknown>;
    const decision = input.decision;
    if (decision !== "ACCEPTED" && decision !== "REJECTED") return NextResponse.json({ error: "Choose accept or reject." }, { status: 400, headers: NO_STORE });
    const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : "";
    if (decision === "REJECTED" && reason.length < 3) return NextResponse.json({ error: "Say why this document is being rejected." }, { status: 400, headers: NO_STORE });

    const found = await load(auth.admin, academicMateId, evidenceId);
    if (found.error) return found.error;
    const { evidence, owner } = found;
    if (owner.verificationStatus !== "PENDING") return NextResponse.json({ error: "Documents can only be reviewed while the application is waiting for review." }, { status: 409, headers: NO_STORE });

    const reviewedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.academicMateEvidence.update({
        where: { id: evidence.id },
        data: { reviewStatus: decision, rejectionReason: decision === "REJECTED" ? reason : null, reviewedByAdminId: auth.admin.adminId, reviewedAt },
      });
      await recordAudit(tx, {
        actor: auth.admin, action: "VERIFICATION_EVIDENCE_REVIEWED", targetType: "ACADEMIC_MATE", targetId: owner.id, universityId: owner.universityId,
        summary: `${decision === "ACCEPTED" ? "Accepted" : "Rejected"} a ${EVIDENCE_LABEL[evidence.kind].toLowerCase()}`,
        metadata: { evidenceId: evidence.id, kind: evidence.kind, decision, reason: decision === "REJECTED" ? reason : null }, context: auth.context,
      });
    });
    return NextResponse.json({ ok: true, reviewStatus: decision, rejectionReason: decision === "REJECTED" ? reason : null, reviewedAt: reviewedAt.toISOString() }, { headers: NO_STORE });
  } catch (error) {
    console.error("PATCH evidence review failed:", error);
    return NextResponse.json({ error: "Unable to save this decision." }, { status: 500, headers: NO_STORE });
  }
}
