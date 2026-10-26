/**
 * Grants admin access to an EXISTING TXMate user. Credentials are never stored in this file.
 *
 *   ADMIN_EMAIL=person@example.com npx tsx scripts/create-admin.ts
 *   ADMIN_EMAIL=person@example.com ADMIN_ROLE=MODERATOR npx tsx scripts/create-admin.ts
 *   ADMIN_EMAIL=person@example.com ADMIN_PASSWORD='a long passphrase' npx tsx scripts/create-admin.ts --reset-password
 *
 * ADMIN_ROLE is PLATFORM_ADMIN (default), UNIVERSITY_ADMIN, MODERATOR or SUPPORT. A university admin
 * also needs rows in AdminUniversityAccess to see anything; pass ADMIN_UNIVERSITY_CODES=CBU,UNZA.
 * The password is only touched with --reset-password, and is never printed.
 */
import "dotenv/config";

import { hashPassword } from "better-auth/crypto";
import { isAdminRole } from "../lib/admin/permissions";
import { prisma } from "../lib/prisma";

const MIN_PASSWORD_LENGTH = 12;

async function main() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!email) throw new Error("Set ADMIN_EMAIL to the account that should become an admin.");

    const role = process.env.ADMIN_ROLE?.trim() || "PLATFORM_ADMIN";
    if (!isAdminRole(role)) throw new Error(`ADMIN_ROLE must be one of PLATFORM_ADMIN, UNIVERSITY_ADMIN, MODERATOR, SUPPORT (got "${role}").`);

    const resetPassword = process.argv.includes("--reset-password");
    const password = process.env.ADMIN_PASSWORD;
    if (resetPassword && (!password || password.length < MIN_PASSWORD_LENGTH)) {
        throw new Error(`--reset-password needs ADMIN_PASSWORD of at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, adminProfile: { select: { id: true, role: true } }, accounts: { where: { providerId: "credential" }, select: { id: true } } },
    });
    if (!user) throw new Error(`No user with email ${email}. They must register first.`);

    const admin = user.adminProfile
        ? await prisma.adminProfile.update({ where: { id: user.adminProfile.id }, data: { role }, select: { id: true, role: true } })
        : await prisma.adminProfile.create({ data: { userId: user.id, role }, select: { id: true, role: true } });

    const codes = (process.env.ADMIN_UNIVERSITY_CODES ?? "").split(",").map((code) => code.trim()).filter(Boolean);
    if (codes.length > 0) {
        const universities = await prisma.university.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
        const missing = codes.filter((code) => !universities.some((university) => university.code === code));
        if (missing.length > 0) throw new Error(`Unknown university code(s): ${missing.join(", ")}.`);
        await prisma.adminUniversityAccess.createMany({
            data: universities.map((university) => ({ adminProfileId: admin.id, universityId: university.id })),
            skipDuplicates: true,
        });
    }

    if (resetPassword && password) {
        const passwordHash = await hashPassword(password);
        const credential = user.accounts[0];
        if (credential) {
            await prisma.account.update({ where: { id: credential.id }, data: { password: passwordHash, updatedAt: new Date() } });
        } else {
            await prisma.account.create({
                data: { id: crypto.randomUUID(), accountId: user.id, providerId: "credential", password: passwordHash, user: { connect: { id: user.id } }, createdAt: new Date(), updatedAt: new Date() },
            });
        }
        // Sign the account out everywhere so an old session cannot outlive the reset.
        await prisma.session.deleteMany({ where: { userId: user.id } });
    }

    console.log(`${user.name} (${email}) is now ${admin.role}.${resetPassword ? " Password was reset and existing sessions were revoked." : ""}`);
}

main()
    .catch((error) => {
        console.error("create-admin failed:", error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
