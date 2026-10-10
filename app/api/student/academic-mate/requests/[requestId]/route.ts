
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestAction = "ACCEPTED" | "DECLINED";

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "You must be signed in to respond to requests." },
        { status: 401 },
      );
    }

    const { requestId } = await params;

    if (!requestId?.trim() || requestId.length > 100) {
      return NextResponse.json(
        { error: "A valid request ID is required." },
        { status: 400 },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 },
      );
    }

    if (!isPlainObject(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object." },
        { status: 400 },
      );
    }

    if (
      Object.keys(body).some((key) => key !== "action") ||
      (body.action !== "ACCEPTED" && body.action !== "DECLINED")
    ) {
      return NextResponse.json(
        {
          error:
            'Choose either "ACCEPTED" or "DECLINED" as the request action.',
        },
        { status: 400 },
      );
    }

    const action = body.action as RequestAction;

    const academicMate = await prisma.academicMateProfile.findUnique({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        status: true,
        verificationStatus: true,
      },
    });

    if (!academicMate) {
      return NextResponse.json(
        { error: "Academic Mate profile not found." },
        { status: 404 },
      );
    }

    if (
      academicMate.status !== "ACTIVE" ||
      academicMate.verificationStatus !== "VERIFIED"
    ) {
      return NextResponse.json(
        {
          error:
            "Only active, verified Academic Mates can respond to requests.",
        },
        { status: 403 },
      );
    }

    const ownedRequest = await prisma.mateRequest.findFirst({
      where: {
        id: requestId,
        offering: {
          is: {
            academicMateProfileId: academicMate.id,
          },
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!ownedRequest) {
      return NextResponse.json(
        {
          error: "Request not found or you are not authorised to manage it.",
        },
        { status: 404 },
      );
    }

    if (ownedRequest.status !== "REQUESTED") {
      return NextResponse.json(
        {
          error: "This request has already been responded to or is no longer pending.",
          currentStatus: ownedRequest.status,
        },
        { status: 409 },
      );
    }

    const respondedAt = new Date();

    const updateResult = await prisma.mateRequest.updateMany({
      where: {
        id: requestId,
        status: "REQUESTED",
        offering: {
          is: {
            academicMateProfileId: academicMate.id,
          },
        },
      },
      data: {
        status: action,
        respondedAt,
      },
    });

    if (updateResult.count !== 1) {
      const currentRequest = await prisma.mateRequest.findFirst({
        where: {
          id: requestId,
          offering: {
            is: {
              academicMateProfileId: academicMate.id,
            },
          },
        },
        select: {
          status: true,
        },
      });

      return NextResponse.json(
        {
          error:
            "This request could not be updated because its status has changed. Refresh and try again.",
          currentStatus: currentRequest?.status ?? null,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      message:
        action === "ACCEPTED"
          ? "Request accepted successfully."
          : "Request declined successfully.",
      request: {
        id: requestId,
        status: action,
        respondedAt,
      },
    });
  } catch (error) {
    console.error(
      "PATCH /api/student/academic-mate/requests/[requestId] failed:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to respond to this request." },
      { status: 500 },
    );
  }
}
