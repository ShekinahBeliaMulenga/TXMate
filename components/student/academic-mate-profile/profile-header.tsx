import Image from "next/image";
import type { ReactNode } from "react";
import { experienceShort, initials, reviewsLabel, statusDot, statusLabel, verificationLabel, verificationStyle } from "./format";
import { FOCUS, Icon, type IconName } from "./profile-ui";
import type { ProfileResponse } from "./types";

type Props = {
  profile: ProfileResponse["profile"];
  user: ProfileResponse["user"];
  student: ProfileResponse["student"];
  statistics: ProfileResponse["statistics"];
  onBack: () => void;
  /** The request button or the explanation shown instead of it. */
  action: ReactNode;
};

function StatTile({icon,value,label,}: {icon: IconName;value: string;label: string;}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-1 py-2 text-center">
      <Icon name={icon} className="h-5 w-5 text-[#7d1f2a]" />
      <dd className="mt-1 text-lg font-semibold leading-none text-[#282321]">{value}</dd>
      <dt className="text-[11px] text-[#6d6260]">{label}</dt>
    </div>
  );
}

/** Banner, avatar, name, rating, headline, key numbers and the primary action. */
export default function ProfileHeader({ profile, user, student, statistics, onBack, action }: Props) {
  const hasRating = statistics.averageRating !== null && statistics.totalReviews > 0;
  const meta = student ? [student.programme.name, `Year ${student.programmeYear.yearNumber}`, student.university.code].join(" · ") : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-[#e2d9d0] bg-white shadow-sm">
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-[#8f2433] via-[#7d1f2a] to-[#4f121a] sm:h-40">
        <svg aria-hidden="true" viewBox="0 0 400 160" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d="M0 96C70 54 130 132 210 94S340 52 400 88V160H0Z" fill="#fff" fillOpacity="0.06" />
          <path d="M0 122C80 84 150 150 230 116S350 84 400 112V160H0Z" fill="#fff" fillOpacity="0.05" />
        </svg>
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          title="Go back"
          className={`absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/15 text-white backdrop-blur-sm transition hover:bg-black/25 focus-visible:ring-offset-0 ${FOCUS}`}
        >
          <Icon name="chevronLeft" className="h-5 w-5" />
        </button>
      </div>

      <div className="relative -mt-8 rounded-t-[2rem] bg-white px-5 pb-5 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="relative -mt-14 shrink-0">
            {user.image ? (
              <Image src={user.image} alt={user.name} width={112} height={112} unoptimized className="h-28 w-28 rounded-full bg-white object-cover ring-4 ring-white" />
            ) : (
              <div aria-hidden="true" className="flex h-28 w-28 items-center justify-center rounded-full bg-[#f2e9e4] text-3xl font-semibold text-[#7d1f2a] ring-4 ring-white">
                {initials(user.name)}
              </div>
            )}
            <span className={`absolute bottom-1.5 right-1.5 block h-4 w-4 rounded-full ring-[3px] ring-white ${statusDot[profile.status]}`} title={statusLabel[profile.status]} role="img" aria-label={statusLabel[profile.status]} />
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#f6e7e9] px-3 py-1.5 text-xs font-semibold text-[#7d1f2a]">
            <Icon name="graduation" className="h-4 w-4" />
            Academic Mate
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#282321]">{user.name}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-[#4e4742]">
          {hasRating ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="star" className="h-4 w-4 fill-amber-500 text-amber-500" />
              <span className="font-semibold text-[#282321]">{statistics.averageRating!.toFixed(1)}</span>
              <span className="text-[#6d6260]">({reviewsLabel(statistics.totalReviews)})</span>
            </span>
          ) : (
            <span className="text-[#6d6260]">No reviews yet</span>
          )}
          <span aria-hidden="true" className="text-[#c9bdb4]">•</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${verificationStyle[profile.verificationStatus]}`}>
            <Icon name={profile.verificationStatus === "VERIFIED" ? "check" : "shield"} className="h-3.5 w-3.5" />
            {verificationLabel[profile.verificationStatus]}
          </span>
        </div>

        {meta ? <p className="mt-2 text-sm text-[#6d6260]">{meta}</p> : null}
        <p className="mt-3 text-sm leading-6 text-[#3f3734]">{profile.headline || "Academic support and tutoring"}</p>

        <dl className="mt-2 grid grid-cols-3 divide-x divide-[#eee6df] border-y border-[#eee6df] py-1">
          <StatTile icon="book" value={String(statistics.totalOfferings)} label="Courses" />
          <StatTile icon="star" value={String(statistics.totalReviews)} label="Reviews" />
          <StatTile icon="briefcase" value={experienceShort(profile.yearsExperience)} label="Experience" />
        </dl>

        <div className="mt-4">{action}</div>
      </div>
    </section>
  );
}
