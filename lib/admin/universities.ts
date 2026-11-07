import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit";
import type { AdminContext } from "./guard";
import type { RequestContext } from "./request-context";
import { cleanSettings, normalizeCode, slugFromCode, validateCode, validateName, type SettingsInput } from "./university-rules";

export type Result<T> = ({ ok: true } & T) | { ok: false; status: 400 | 404 | 409; error: string };
const fail = (status: 400 | 404 | 409, error: string) => ({ ok: false as const, status, error });

export type UniversityRow = {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  students: number;
  mates: number;
  admins: number;
  settings: {
    studentIdMinLength: number;
    studentIdMaxLength: number;
    studentIdPrefix: string | null;
    studentIdPattern: string | null;
    requireUniversityEmail: boolean;
    universityEmailDomain: string | null;
  };
};

const DEFAULT_SETTINGS = { studentIdMinLength: 1, studentIdMaxLength: 50, studentIdPrefix: null, studentIdPattern: null, requireUniversityEmail: false, universityEmailDomain: null };

export async function listUniversities(): Promise<UniversityRow[]> {
  const rows = await prisma.university.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      settings: { select: { studentIdMinLength: true, studentIdMaxLength: true, studentIdPrefix: true, studentIdPattern: true, requireUniversityEmail: true, universityEmailDomain: true } },
      _count: { select: { studentProfiles: true, academicMateProfiles: true, adminAccess: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    students: row._count.studentProfiles,
    mates: row._count.academicMateProfiles,
    admins: row._count.adminAccess,
    settings: row.settings ?? DEFAULT_SETTINGS,
  }));
}

export async function createUniversity(admin: AdminContext, input: { name: string; code: string; context: RequestContext }): Promise<Result<{ id: string; message: string }>> {
  const nameProblem = validateName(input.name);
  if (nameProblem) return fail(400, nameProblem);
  const codeProblem = validateCode(input.code);
  if (codeProblem) return fail(400, codeProblem);
  const name = input.name.trim();
  const code = normalizeCode(input.code);
  const slug = slugFromCode(code);

  const existing = await prisma.university.findFirst({ where: { OR: [{ code }, { slug }] }, select: { id: true } });
  if (existing) return fail(409, `A university with the code ${code} already exists.`);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const university = await tx.university.create({ data: { name, code, slug, settings: { create: {} } }, select: { id: true } });
      await recordAudit(tx, { actor: admin, action: "UNIVERSITY_CREATED", targetType: "UNIVERSITY", targetId: university.id, universityId: university.id, summary: `Added ${name} (${code})`, metadata: { code }, context: input.context });
      return university;
    });
    return { ok: true, id: created.id, message: `${name} was added.` };
  } catch (error) {
    // Two admins adding the same code at once: the unique index decides.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") return fail(409, `A university with the code ${code} already exists.`);
    throw error;
  }
}

export async function updateUniversity(
  admin: AdminContext,
  input: { id: string; name?: unknown; status?: unknown; settings?: SettingsInput; context: RequestContext },
): Promise<Result<{ message: string }>> {
  const data: { name?: string; status?: "ACTIVE" | "INACTIVE" } = {};
  if (input.name !== undefined) {
    if (typeof input.name !== "string") return fail(400, "Name must be text.");
    const problem = validateName(input.name);
    if (problem) return fail(400, problem);
    data.name = input.name.trim();
  }
  if (input.status !== undefined) {
    if (input.status !== "ACTIVE" && input.status !== "INACTIVE") return fail(400, "Status must be ACTIVE or INACTIVE.");
    data.status = input.status;
  }
  const settings = cleanSettings(input.settings ?? {});
  if (!settings.ok) return fail(400, settings.error);

  const changed = [...Object.keys(data), ...Object.keys(settings.value)];
  if (changed.length === 0) return fail(400, "Nothing to change.");

  return prisma.$transaction(async (tx) => {
    const university = await tx.university.findUnique({ where: { id: input.id }, select: { id: true, name: true, settings: { select: { studentIdMinLength: true, studentIdMaxLength: true } } } });
    if (!university) return fail(404, "University not found.");

    // Min and max are validated together against what is already stored.
    const min = settings.value.studentIdMinLength ?? university.settings?.studentIdMinLength ?? 1;
    const max = settings.value.studentIdMaxLength ?? university.settings?.studentIdMaxLength ?? 50;
    if (min > max) return fail(400, "Minimum ID length can’t be more than the maximum.");

    if (Object.keys(data).length > 0) await tx.university.update({ where: { id: university.id }, data });
    if (Object.keys(settings.value).length > 0) {
      await tx.universitySettings.upsert({ where: { universityId: university.id }, create: { universityId: university.id, ...settings.value }, update: settings.value });
    }
    await recordAudit(tx, { actor: admin, action: "UNIVERSITY_UPDATED", targetType: "UNIVERSITY", targetId: university.id, universityId: university.id, summary: `Updated ${data.name ?? university.name}: ${changed.join(", ")}`, metadata: { fields: changed.join(",") }, context: input.context });
    return { ok: true as const, message: "Saved." };
  });
}
