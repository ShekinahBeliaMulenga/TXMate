import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_IMAGE_BYTES = 1_500_000;
const IMAGE_PATTERN = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/;

function decodedByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

async function getAuthenticatedUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

export async function PUT(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      !("image" in body)
    ) {
      return NextResponse.json(
        { error: "An image is required." },
        { status: 400 },
      );
    }

    const image = (body as { image?: unknown }).image;

    if (typeof image !== "string") {
      return NextResponse.json(
        { error: "The profile picture must be a valid image." },
        { status: 400 },
      );
    }

    const match = image.match(IMAGE_PATTERN);

    if (!match) {
      return NextResponse.json(
        {
          error:
            "Only WebP, JPEG, and PNG profile pictures are supported.",
        },
        { status: 400 },
      );
    }

    const base64Data = match[2];
    const imageBytes = decodedByteLength(base64Data);

    if (imageBytes <= 0 || imageBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error:
            "The processed profile picture is too large. Please choose a smaller image.",
        },
        { status: 400 },
      );
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        image,
      },
      select: {
        image: true,
      },
    });

    return NextResponse.json({
      image: updatedUser.image,
    });
  } catch (error) {
    console.error("PUT /api/student/profile-image failed:", error);

    return NextResponse.json(
      { error: "Unable to update your profile picture." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        image: null,
      },
    });

    return NextResponse.json({
      image: null,
    });
  } catch (error) {
    console.error("DELETE /api/student/profile-image failed:", error);

    return NextResponse.json(
      { error: "Unable to remove your profile picture." },
      { status: 500 },
    );
  }
}
