import "dotenv/config";
import { prisma } from "../lib/prisma";
import { normalizePhone } from "../lib/phone";
import { planPhoneNormalization } from "../lib/phone-migration";

/**
 * Converts phone numbers saved in older formats (0971234567, 971234567, 260971234567) to E.164 (+260971234567),
 * so the database's unique index sees every duplicate. It is safe to run more than once.
 *
 *   npx tsx scripts/normalize-phone-numbers.ts            lists what would change; changes nothing
 *   npx tsx scripts/normalize-phone-numbers.ts --apply    makes the changes
 *
 * Numbers that cannot be read, and numbers that would collide with another account's, are listed and left
 * untouched so a person can decide what to do with them. Each row is updated only if it still holds the value
 * that was read, so a student editing their number at the same moment is never overwritten.
 */
async function main() {
  const apply = process.argv.includes("--apply");
  const rows = (await prisma.studentProfile.findMany({ where: { phoneNumber: { not: null } }, select: { id: true, phoneNumber: true } }))
    .flatMap((row) => (row.phoneNumber ? [{ id: row.id, phoneNumber: row.phoneNumber }] : []));
  const plan = planPhoneNormalization(rows, (raw) => normalizePhone(raw));

  console.log(`${rows.length} saved number(s): ${plan.alreadyNormalised} already correct, ${plan.updates.length} to convert, ${plan.unreadable.length} unreadable, ${plan.conflicts.length} conflict(s).`);
  for (const item of plan.unreadable) console.log(`UNREADABLE  profile ${item.id}: "${item.phoneNumber}"`);
  for (const conflict of plan.conflicts) console.log(`CONFLICT    ${conflict.to}: ${conflict.rows.map((row) => `${row.id} ("${row.phoneNumber}")`).join(", ")}`);

  let changed = 0;
  let failed = 0;
  for (const item of plan.updates) {
    if (!apply) { console.log(`Would change profile ${item.id}: "${item.from}" -> ${item.to}`); continue; }
    try {
      const result = await prisma.studentProfile.updateMany({ where: { id: item.id, phoneNumber: item.from }, data: { phoneNumber: item.to } });
      changed += result.count;
    } catch (error) {
      failed++;
      console.error(`Could not change profile ${item.id}:`, error instanceof Error ? error.message : error);
    }
  }
  if (apply) console.log(`Changed ${changed} number(s). ${failed} failed.`);
  else if (plan.updates.length > 0) console.log("Nothing was changed. Run again with --apply to make these changes.");
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

void main();
