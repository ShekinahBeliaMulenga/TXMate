import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Configuring CBU academic year...");

  const university = await prisma.university.findUnique({
    where: { code: "CBU" },
    select: { id: true, name: true },
  });

  if (!university) {
    throw new Error(
      "CBU was not found. Run the main academic seed before this script.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.academicYear.updateMany({
      where: {
        universityId: university.id,
        isCurrent: true,
      },
      data: {
        isCurrent: false,
      },
    });

    await tx.academicYear.upsert({
      where: {
        universityId_name: {
          universityId: university.id,
          name: "2026",
        },
      },
      update: {
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T23:59:59.999Z"),
        isCurrent: true,
      },
      create: {
        universityId: university.id,
        name: "2026",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T23:59:59.999Z"),
        isCurrent: true,
      },
    });

    await tx.universitySettings.update({
      where: {
        universityId: university.id,
      },
      data: {
        studentIdMinLength: 8,
        studentIdMaxLength: 8,
        studentIdPattern: "^\\d{8}$",
      },
    });
  });

  const currentYears = await prisma.academicYear.findMany({
    where: {
      universityId: university.id,
      isCurrent: true,
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isCurrent: true,
    },
  });

  const settings = await prisma.universitySettings.findUnique({
    where: { universityId: university.id },
    select: {
      studentIdMinLength: true,
      studentIdMaxLength: true,
      studentIdPattern: true,
    },
  });

  console.log("");
  console.log("CBU configuration completed.");
  console.log(`University: ${university.name}`);
  console.log(`Current academic year: ${currentYears[0]?.name ?? "NONE"}`);
  console.log(
    `Student ID rule: ${settings?.studentIdMinLength}-${settings?.studentIdMaxLength} digits`,
  );
  console.log(`Student ID pattern: ${settings?.studentIdPattern ?? "NONE"}`);
  console.log("");
  console.log(
    "The 2026 date range is TXMate's operational data boundary for development.",
  );
  console.log(
    "It is not being represented as CBU's official teaching-calendar boundary.",
  );
}

main()
  .catch((error) => {
    console.error("CBU academic-year configuration failed.");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
