import Link from "next/link";
import { FOCUS, Icon } from "./profile-ui";
import type { Offering, RequestsByOffering, Viewer } from "./types";

type Props = {
  viewer: Viewer;
  offerings: readonly Offering[];
  requestsByOffering: RequestsByOffering;
  onRequest: (offering: Offering) => void;
  /** More than one course: send the student to the course list to pick one. */
  onChooseCourse: () => void;
  /** Compact variant used in the mobile bottom bar. */
  compact?: boolean;
};

const PRIMARY = `flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#7d1f2a] text-[13px] font-semibold text-white shadow-sm shadow-[#7d1f2a]/20 transition hover:bg-[#691923] ${FOCUS}`;
const DISABLED = "flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#e2d9d0] bg-[#f6f2ee] text-[13px] font-semibold text-[#7a6f6a]";

/** The profile's main action. Always one element, whatever the viewer is allowed to do. Same height in both variants. */
export default function RequestCta({ viewer, offerings, requestsByOffering, onRequest, onChooseCourse }: Props) {
  if (viewer.canRequest) {
    if (offerings.length === 0) {
      return <button type="button" disabled className={DISABLED}>No courses available yet</button>;
    }
    if (offerings.length === 1) {
      const offering = offerings[0];
      const request = requestsByOffering[offering.id];
      if (request) {
        return (
          <p role="status" className={`${DISABLED} border-emerald-200 bg-emerald-50 text-emerald-700`}>
            <Icon name="check" className="h-4 w-4" />
            {request.status === "ACCEPTED" ? "Request accepted" : "Request sent"}
          </p>
        );
      }
      return (
        <button type="button" onClick={() => onRequest(offering)} className={PRIMARY}>
          <Icon name="calendar" className="h-4 w-4" />
          Request support
        </button>
      );
    }
    return (
      <button type="button" onClick={onChooseCourse} className={PRIMARY}>
        <Icon name="calendar" className="h-4 w-4" />
        Request support
      </button>
    );
  }

  if (viewer.isOwner) {
    return (
      <Link href="/student/academic-mate/profile" className={PRIMARY}>
        <Icon name="pencil" className="h-4 w-4" />
        Edit my profile
      </Link>
    );
  }

  return (
    <div className="rounded-xl bg-[#f6f2ee] p-3">
      <p className="text-xs leading-5 text-[#6d6260]">
        {viewer.signedIn
          ? "Requests are available to active TXMate students at the same university as this Academic Mate."
          : "Sign in with your TXMate student account at the same university to request academic support."}
      </p>
      {!viewer.signedIn ? (
        <Link href="/login" className={`mt-2.5 ${PRIMARY}`}>Sign in</Link>
      ) : null}
    </div>
  );
}