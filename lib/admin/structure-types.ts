export type StructureProgramme = {
  id: string;
  code: string;
  name: string;
  level: string;
  durationYears: number | null;
  departmentId: string | null;
  years: number;
  students: number;
  /** Courses placed in any year of this programme. */
  courses: number;
};
export type StructureSchool = {
  id: string;
  code: string;
  name: string;
  departments: Array<{ id: string; code: string; name: string }>;
  programmes: StructureProgramme[];
};
export const DURATION_MIN = 1;
export const DURATION_MAX = 8;
/** A programme is usable by students only with a department and at least one year. */
export const programmeReady = (programme: Pick<StructureProgramme, "departmentId" | "years">) => programme.departmentId !== null && programme.years > 0;
