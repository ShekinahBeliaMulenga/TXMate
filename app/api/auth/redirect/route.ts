import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await import("next/headers").then(
                ({ headers }) => headers(),
            ),
        });

        if (!session?.user?.id) {
            return NextResponse.json(
                {
                    error: "Unauthorized.",
                },
                { status: 401 },
            );
        }

        const admin = await prisma.adminProfile.findUnique({
            where: {
                userId: session.user.id,
            },
            select: {
                role: true,
            },
        });

        if (
            admin &&
            (
                admin.role === "PLATFORM_ADMIN" ||
                admin.role === "UNIVERSITY_ADMIN" ||
                admin.role === "MODERATOR" ||
                admin.role === "SUPPORT"
            )
        ) {
            return NextResponse.json({
                redirectTo: "/admin/academic-mates",
            });
        }

        return NextResponse.json({
            redirectTo: "/student/dashboard",
        });
    } catch (error) {
        console.error(
            "GET /api/auth/redirect failed:",
            error,
        );

        return NextResponse.json(
            {
                error: "Unable to determine account destination.",
            },
            { status: 500 },
        );
    }
}