import "dotenv/config";

import { prisma } from "../lib/prisma";
import { hashPassword } from "better-auth/crypto";

const ADMIN_EMAIL = "boss@cbu.ac.com";
const ADMIN_PASSWORD = "letmein";

async function main() {
    const user = await prisma.user.findUnique({
        where: {
            email: ADMIN_EMAIL,
        },
        select: {
            id: true,
            email: true,
            name: true,
            adminProfile: {
                select: {
                    id: true,
                    role: true,
                },
            },
            accounts: {
                where: {
                    providerId: "credential",
                },
                select: {
                    id: true,
                    accountId: true,
                    providerId: true,
                },
            },
        },
    });

    if (!user) {
        throw new Error(
            `Admin user ${ADMIN_EMAIL} was not found.`,
        );
    }

    if (!user.adminProfile) {
        await prisma.adminProfile.create({
            data: {
                userId: user.id,
                role: "PLATFORM_ADMIN",
            },
        });

        console.log("AdminProfile created.");
    }

    const passwordHash = await hashPassword(
        ADMIN_PASSWORD,
    );

    const credentialAccount = user.accounts[0];

    if (credentialAccount) {
        await prisma.account.update({
            where: {
                id: credentialAccount.id,
            },
            data: {
                accountId: user.id,
                password: passwordHash,
                providerId: "credential",
                updatedAt: new Date(),
            },
        });

        console.log("Existing credential account repaired.");
    } else {
        await prisma.account.create({
            data: {
                id: crypto.randomUUID(),
                accountId: user.id,
                providerId: "credential",
                password: passwordHash,
                user: {
                    connect: {
                        id: user.id,
                    },
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
    
        console.log("Credential account created.");
    }

    console.log("");
    console.log("Admin account is ready.");
    console.log({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.adminProfile?.role ?? "PLATFORM_ADMIN",
    });

    console.log("");
    console.log("Login credentials:");
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
}

main()
    .catch((error) => {
        console.error(
            "Failed to repair admin account:",
            error,
        );
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });