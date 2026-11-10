
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2Object, uploadR2Object } from "@/lib/r2";
import { detectImageFormat } from "@/lib/image-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** The largest request that can hold a 10 MB image: base64 is 4/3 the size, plus room for the JSON around it. */
const MAX_REQUEST_BYTES = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4096;
const IMAGE_PATTERN =
  /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/;

function decodedByteLength(base64: string): number {
  const padding = base64.endsWith("==")
    ? 2
    : base64.endsWith("=")
      ? 1
      : 0;

  return Math.floor((base64.length * 3) / 4) - padding;
}

function getImageKey(userId: string): string {
  return `profile-images/${userId}/profile`;
}

function getImagePath(userId: string): string {
  return `/api/profile-images/${encodeURIComponent(userId)}`;
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
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 },
      );
    }

    // Refuse an oversized upload before reading it into memory.
    const declaredLength = Number(request.headers.get("content-length"));

    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        {
          error:
            "The processed profile picture must not exceed 10 MB.",
        },
        { status: 413 },
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

    const [, format, base64Data] = match;
    const imageBytes = decodedByteLength(base64Data);

    if (imageBytes <= 0 || imageBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error:
            "The processed profile picture must not exceed 10 MB.",
        },
        { status: 400 },
      );
    }

    // The data URL only claims a type; the bytes must really be that kind of image.
    const imageBuffer = Buffer.from(base64Data, "base64");

    if (detectImageFormat(imageBuffer) !== format) {
      return NextResponse.json(
        {
          error:
            "The selected file is not a valid image.",
        },
        { status: 400 },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 },
      );
    }

    const key = getImageKey(userId);

    // Upload the image before changing the database reference.
    await uploadR2Object(
      key,
      imageBuffer,
      `image/${format}`,
    );

    const imagePath = `${getImagePath(userId)}?v=${Date.now()}`;

    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { image: imagePath },
        select: { image: true },
      });

      return NextResponse.json({
        image: updatedUser.image,
      });
    } catch (error) {
      // Preserve an existing R2 object if its database reference
      // was already pointing to this user's R2 profile image.
      const previousImage = existingUser.image;
      const basePath = getImagePath(userId);

      const previousWasR2Image =
        previousImage === basePath ||
        previousImage?.startsWith(`${basePath}?`) === true;

      if (!previousWasR2Image) {
        try {
          await deleteR2Object(key);
        } catch (cleanupError) {
          console.error(
            "Failed to clean up uploaded profile image:",
            cleanupError,
          );
        }
      }

      throw error;
    }
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
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 },
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { image: null },
    });

    const basePath = getImagePath(userId);
    const previousImage = existingUser.image;

    const previousWasR2Image =
      previousImage === basePath ||
      previousImage?.startsWith(`${basePath}?`) === true;

    if (previousWasR2Image) {
      try {
        await deleteR2Object(getImageKey(userId));
      } catch (error) {
        console.error(
          "Failed to delete profile image from R2:",
          error,
        );
      }
    }

    return NextResponse.json({ image: null });
  } catch (error) {
    console.error("DELETE /api/student/profile-image failed:", error);

    return NextResponse.json(
      { error: "Unable to remove your profile picture." },
      { status: 500 },
    );
  }
}
