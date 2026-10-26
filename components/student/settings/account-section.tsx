import Link from "next/link";
import type { ProfileResponse, StudentStatus } from "./settings-types";
import { FOCUS, Icon, InfoNote, INPUT_READONLY, LABEL } from "./settings-ui";

const STATUS_LABEL: Record<StudentStatus, string> = {
  ACTIVE: "Active",
  GRADUATED: "Graduated",
  SUSPENDED: "Suspended",
  WITHDRAWN: "Withdrawn",
};

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <p className={`mt-2 ${INPUT_READONLY}`}>{value}</p>
    </div>
  );
}

/** Read-only student record, plus the way into course management. */
export default function AccountSection({ studentProfile }: { studentProfile: ProfileResponse["studentProfile"] }) {
  return (
    <div className="space-y-5">
      <ReadOnlyField label="Student ID" value={studentProfile.studentId} />
      <ReadOnlyField label="Gender" value={studentProfile.gender === "MALE" ? "Male" : "Female"} />
      <ReadOnlyField label="Status" value={STATUS_LABEL[studentProfile.status] ?? studentProfile.status} />

      <InfoNote>
        If any of this information is incorrect, please contact the university or TXMate support. Your email, university, programme, year of study and enrolled courses can’t be changed from settings.
      </InfoNote>

      <Link
        href="/student/repeating-courses"
        className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#7d1f2a] text-sm font-semibold text-white shadow-sm transition hover:bg-[#691923] ${FOCUS}`}
      >
        <Icon name="book" className="h-[18px] w-[18px]" />
        Manage courses
      </Link>
    </div>
  );
}
