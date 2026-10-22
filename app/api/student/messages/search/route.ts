import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MIN_LEN = 3;
const MAX_LEN = 100;
const MAX_RESULTS = 30;

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (q.length < MIN_LEN) return NextResponse.json({ results: [] });
    if (q.length > MAX_LEN) {
      return NextResponse.json({ error: "Search is too long." }, { status: 400 });
    }

    // Same access rule as GET /api/student/messages, so every hit maps to a
    // conversation the inbox already shows. This is the security boundary:
    // never take a user id or conversation id from the client.
    const messages = await prisma.message.findMany({
      where: {
        body: { contains: q, mode: "insensitive" },
        conversation: {
          request: {
            OR: [
              { studentProfile: { userId } },
              { offering: { academicMateProfile: { userId } } },
            ],
            tutoringSession: { isNot: null },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_RESULTS,
      select: {
        id: true,
        conversationId: true,
        senderUserId: true,
        body: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      results: messages.map((m) => ({
        messageId: m.id,
        conversationId: m.conversationId,
        fromMe: m.senderUserId === userId,
        body: m.body.length > 600 ? m.body.slice(0, 600) : m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Failed to search messages:", error);
    return NextResponse.json({ error: "Unable to search messages." }, { status: 500 });
  }
}