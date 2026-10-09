import { prisma } from "../../../../lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const userCount = await prisma.user.count();

    return NextResponse.json({
      status: "ok",
      database: "connected",
      users: userCount,
    });
  } catch (error) {
    console.error("Database connection failed:", error);

    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
      },
      { status: 500 }
    );
  }
}