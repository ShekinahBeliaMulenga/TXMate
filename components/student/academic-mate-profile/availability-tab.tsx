import { formatTime, weekdayLabel, weekdayOrder } from "./format";
import { Block, Empty, Surface } from "./profile-ui";
import type { AvailabilitySlot, Offering, Weekday } from "./types";

/** Weekly tutoring times grouped by day, each slot tagged with the course it is for. */
export default function AvailabilityTab({ slots, offerings }: { slots: readonly AvailabilitySlot[]; offerings: readonly Offering[] }) {
  const offeringById = new Map(offerings.map((offering) => [offering.id, offering]));
  const byDay = new Map<Weekday, AvailabilitySlot[]>();
  for (const slot of [...slots].sort((a, b) => a.startMinute - b.startMinute)) {
    byDay.set(slot.day, [...(byDay.get(slot.day) ?? []), slot]);
  }

  return (
    <Surface>
      <Block title="Weekly availability" icon="calendar">
        {byDay.size === 0 ? (
          <Empty text="No availability has been added yet." />
        ) : (
          <ul className="space-y-3.5">
            {weekdayOrder.map((day) => {
              const daySlots = byDay.get(day);
              if (!daySlots?.length) return null;
              return (
                <li key={day} className="flex items-start gap-3">
                  <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-xs font-semibold text-[#7d1f2a]" title={weekdayLabel[day]}>
                    {weekdayLabel[day].slice(0, 3)}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {daySlots.map((slot) => {
                      const offering = offeringById.get(slot.mateOfferingId);
                      return (
                        <span key={slot.id} className="inline-flex items-center gap-2 rounded-lg border border-[#ece5de] bg-[#fbf9f7] px-2.5 py-2 text-xs font-medium text-[#514844]">
                          <span className="tabular-nums">{formatTime(slot.startMinute)} – {formatTime(slot.endMinute)}</span>
                          {offering ? <span title={offering.course.name} className="border-l border-[#e2d9d0] pl-2 text-[11px] font-semibold text-[#7d1f2a]">{offering.course.code}</span> : null}
                        </span>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Block>
    </Surface>
  );
}
