import "dotenv/config";
import { prisma } from "../lib/prisma";
import { deleteR2Object } from "../lib/r2";

/**
 * Deletes identity documents whose keep-until date has passed (30 days after an approval, 90 days after a
 * rejection), from private storage and from the database. Run it on a schedule, for example once a day:
 *
 *   npx tsx scripts/purge-verification-evidence.ts
 *
 * Add --dry-run to list what would be deleted without deleting anything. A file is removed from storage before
 * its row, so a failure never leaves a stored document that nothing points to.
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const due = await prisma.academicMateEvidence.findMany({
    where: { purgeAfter: { not: null, lte: new Date() } },
    select: { id: true, storageKey: true },
    take: 500,
  });
  let removed = 0;
  let failed = 0;
  for (const item of due) {
    if (dryRun) { console.log(`Would delete ${item.id}`); continue; }
    try {
      await deleteR2Object(item.storageKey);
      await prisma.academicMateEvidence.deleteMany({ where: { id: item.id } });
      removed++;
    } catch (error) {
      failed++;
      console.error(`Could not delete ${item.id}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(dryRun ? `${due.length} document(s) are due for deletion.` : `Deleted ${removed} document(s). ${failed} failed.`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

void main();
