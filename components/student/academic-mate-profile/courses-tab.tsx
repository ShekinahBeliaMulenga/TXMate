import { formatStatus, rateTypeLabel } from "./format";
import { FOCUS, Icon, Surface } from "./profile-ui";
import type { Offering, RequestsByOffering, Viewer } from "./types";

type Props = {
  offerings: readonly Offering[];
  requestsByOffering: RequestsByOffering;
  viewer: Viewer;
  busyOfferingId: string | null;
  onRequest: (offering: Offering) => void;
  onCancel: (offering: Offering) => void;
};

function OfferingCard({ offering, request, canRequest, busy, onRequest, onCancel }: {
  offering: Offering;
  request: RequestsByOffering[string] | undefined;
  canRequest: boolean;
  busy: boolean;
  onRequest: () => void;
  onCancel: () => void;
}) {
  const topics = offering.topics.slice(0, 4).map((topic) => topic.name).join(", ");
  const subtitle = topics || offering.title || offering.course.code;

  return (
    <li className="rounded-xl border border-[#ece5de] bg-white p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7d1f2a] text-white">
          <Icon name="book" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold leading-5 text-[#282321]">{offering.course.name}</h3>
          <p className="mt-0.5 text-xs leading-4 text-[#6d6260]">
            <span className="font-semibold text-[#7d1f2a]">{offering.course.code}</span>
            {subtitle !== offering.course.code ? <span> · {subtitle}</span> : null}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-bold leading-5 text-[#282321]">{offering.currency} {offering.rate}</p>
          <p className="text-[11px] leading-4 text-[#6d6260]">{rateTypeLabel[offering.rateType]}</p>
        </div>
      </div>

      {offering.description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#625b55]">{offering.description}</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#4e4742]">
        <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3 w-3 text-[#8a817a]" />{offering.sessionDurationMinutes} min session</span>
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{formatStatus(offering.status)}</span>
      </div>

      {offering.rateType === "CUSTOM" && offering.rateDetails ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-[#6b625c]">
          <Icon name="info" className="mt-0.5 h-3 w-3 shrink-0 text-[#8a817a]" />
          <span>{offering.rateDetails}</span>
        </p>
      ) : null}

      {canRequest ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-[#efe8e1] pt-2.5">
          {request && !request.hasSession ? (
            <button type="button" disabled={busy} onClick={onCancel} className={`inline-flex h-8 items-center justify-center rounded-lg border border-[#d8cec5] bg-white px-3 text-xs font-semibold text-[#7d1f2a] transition hover:border-[#c9a9ad] hover:bg-[#f8f2f0] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`}>
              {busy ? "Working…" : "Cancel request"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!!request || busy}
            onClick={onRequest}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition disabled:cursor-not-allowed ${FOCUS} ${request ? "border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-100" : "bg-[#7d1f2a] text-white shadow-sm shadow-[#7d1f2a]/15 hover:bg-[#681923] disabled:opacity-70"}`}
          >
            {request ? (
              <>
                <Icon name="check" className="h-3 w-3" />
                {request.status === "ACCEPTED" ? "Request accepted" : "Request sent"}
              </>
            ) : busy ? "Sending…" : "Request"}
          </button>
        </div>
      ) : null}

      {request?.hasSession ? (
        <p className="mt-2.5 border-t border-[#efe8e1] pt-2.5 text-[11px] leading-4 text-[#6d6260]">A session has been scheduled for this request. Manage any changes from your sessions page.</p>
      ) : null}
    </li>
  );
}

/** Every course the Academic Mate supports, each with price, duration and its own request control. */
export default function CoursesTab({ offerings, requestsByOffering, viewer, busyOfferingId, onRequest, onCancel }: Props) {
  if (offerings.length === 0) {
    return <Surface><p className="text-sm text-[#7a6f6a]">No courses have been added yet.</p></Surface>;
  }
  return (
    <div>
      <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-[#282321]">
        <Icon name="book" className="h-4 w-4 text-[#7d1f2a]" />
        Courses offered
      </h2>
      <ul className="space-y-2">
        {offerings.map((offering) => (
          <OfferingCard
            key={offering.id}
            offering={offering}
            request={requestsByOffering[offering.id]}
            canRequest={viewer.canRequest}
            busy={busyOfferingId === offering.id}
            onRequest={() => onRequest(offering)}
            onCancel={() => onCancel(offering)}
          />
        ))}
      </ul>
    </div>
  );
}