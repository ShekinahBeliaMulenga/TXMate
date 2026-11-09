/** Planning for the one-off conversion of saved phone numbers to E.164. Pure, so it can be tested without a database. */
export type PhoneRow = { id: string; phoneNumber: string };
export type PhonePlan = {
  /** Rows that will be rewritten. */
  updates: { id: string; from: string; to: string }[];
  /** Numbers that could not be read as a valid phone number. They are left as they are. */
  unreadable: PhoneRow[];
  /** Two or more rows that are the same number once normalised. None of them is changed; an admin must decide. */
  conflicts: { to: string; rows: PhoneRow[] }[];
  /** Rows that were already in E.164 and not part of a conflict. */
  alreadyNormalised: number;
};

export function planPhoneNormalization(rows: PhoneRow[], normalize: (raw: string) => string | null): PhonePlan {
  const unreadable: PhoneRow[] = [];
  const byTarget = new Map<string, PhoneRow[]>();
  for (const row of rows) {
    const target = normalize(row.phoneNumber);
    if (!target) { unreadable.push(row); continue; }
    byTarget.set(target, [...(byTarget.get(target) ?? []), row]);
  }
  const updates: PhonePlan["updates"] = [];
  const conflicts: PhonePlan["conflicts"] = [];
  let alreadyNormalised = 0;
  for (const [to, group] of byTarget) {
    if (group.length > 1) { conflicts.push({ to, rows: group }); continue; }
    const [row] = group;
    if (row.phoneNumber === to) alreadyNormalised++;
    else updates.push({ id: row.id, from: row.phoneNumber, to });
  }
  return { updates, unreadable, conflicts, alreadyNormalised };
}
