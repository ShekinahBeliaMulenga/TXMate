import { Block, Empty, Icon, Surface, type IconName } from "./profile-ui";
import type { Experience, Offering, ProfileResponse, Qualification } from "./types";

type Props = {
  profile: ProfileResponse["profile"];
  student: ProfileResponse["student"];
  offerings: readonly Offering[];
  experiences: readonly Experience[];
  qualifications: readonly Qualification[];
};

function Row({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-[#7d1f2a]" />
      <div className="min-w-0">
        <dt className="text-xs text-[#7a6f6a]">{label}</dt>
        <dd className="text-[13px] font-medium text-[#282321]">{value}</dd>
      </div>
    </div>
  );
}

export default function AboutTab({ profile, student, offerings, experiences, qualifications }: Props) {
  // One chip per distinct course, in alphabetical order.
  const courses= [...new Set(offerings.map((offering) => offering.course.name))].sort((a, b) => a.localeCompare(b));

  return (
    <Surface>
      <Block title="About me" icon="user">
        {profile.bio ? <p className="max-w-prose whitespace-pre-wrap text-[13px] leading-5 text-[#3f3734]">{profile.bio}</p> : <Empty text="This Academic Mate hasn’t added a bio yet." />}
      </Block>

      {courses.length > 0 ? (
        <Block title="Courses I teach" icon="book">
          <ul className="flex flex-wrap gap-2">
            {courses.map((course) => (
              <li key={course} className="rounded-full border border-[#e2d9d0] bg-[#fbf9f7] px-2.5 py-1 text-xs text-[#4e4742]">{course}</li>
            ))}
          </ul>
        </Block>
      ) : null}

      {profile.teachingExperience ? (
        <Block title="Teaching experience" icon="briefcase">
          <p className="max-w-prose whitespace-pre-wrap text-[13px] leading-5 text-[#3f3734]">{profile.teachingExperience}</p>
        </Block>
      ) : null}

    {student ? (
      <Block title="Studying" icon="graduation">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row icon="university" label="University" value={student.university.name} />
          <Row icon="book" label="Programme" value={`${student.programme.name}, Year ${student.programmeYear.yearNumber}`} />
          {student.department ? <Row icon="briefcase" label="Department" value={student.department.name} /> : null}
        </dl>
      </Block>
    ) : null}

      {experiences.length > 0 ? (
        <Block title="Experience" icon="briefcase">
          <ul className="space-y-3">
            {experiences.map((item) => (
              <li key={item.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <h3 className="text-[13px] font-semibold text-[#282321]">{item.title}</h3>
                  {item.startYear !== null ? <span className="text-xs text-[#7a6f6a]">{item.startYear} – {item.endYear ?? "Present"}</span> : null}
                </div>
                {item.organisation ? <p className="mt-0.5 text-xs text-[#6d6260]">{item.organisation}</p> : null}
                {item.description ? <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-5 text-[#514844]">{item.description}</p> : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {qualifications.length > 0 ? (
        <Block title="Qualifications" icon="certificate">
          <ul className="space-y-3">
            {qualifications.map((item) => (
              <li key={item.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <h3 className="text-[13px] font-semibold text-[#282321]">{item.name}</h3>
                  {item.year !== null ? <span className="text-xs text-[#7a6f6a]">{item.year}</span> : null}
                </div>
                {item.issuer ? <p className="mt-0.5 text-xs text-[#6d6260]">{item.issuer}</p> : null}
                {item.credentialUrl ? (
                  <a href={item.credentialUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#7d1f2a] hover:underline hover:underline-offset-2">
                    View credential <Icon name="arrow" className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </Surface>
  );
}