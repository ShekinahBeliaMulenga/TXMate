import { prisma } from "@/lib/prisma";

async function main() {
  const conversations = await prisma.conversation.findMany({
    select: {
      id: true,
      request: {
        select: {
          studentProfile: { select: { userId: true } },
          offering: { select: { academicMateProfile: { select: { userId: true } } } },
        },
      },
    },
  });

  const data = conversations.flatMap((conversation) => [
    {
      conversationId: conversation.id,
      userId: conversation.request.studentProfile.userId,
      lastReadAt: new Date(),
    },
    {
      conversationId: conversation.id,
      userId: conversation.request.offering.academicMateProfile.userId,
      lastReadAt: new Date(),
    },
  ]);

  // Existing rows are left untouched, so running this twice is safe.
  const result = await prisma.conversationRead.createMany({ data, skipDuplicates: true });
  console.log(`Created ${result.count} read markers for ${conversations.length} conversations.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());