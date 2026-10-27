import { formatTime, weekdayLabel, weekdayOrder } from "./format";
import { Block, Empty, Surface } from "./profile-ui";
import type { AvailabilitySlot, Offering, Weekday } from "./types";

/** Weekly tutoring times grouped by day. Every slot is the same size: a fixed-height cell in a grid. */
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
          <ul className="space-y-2.5">
            {weekdayOrder.map((day) => {
              const daySlots = byDay.get(day);
              if (!daySlots?.length) return null;
              return (
                <li key={day} className="flex items-start gap-2.5">
                  <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-xs font-semibold text-[#7d1f2a]" title={weekdayLabel[day]}>
                    {weekdayLabel[day].slice(0, 3)}
                  </span>
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {daySlots.map((slot) => {
                      const offering = offeringById.get(slot.mateOfferingId);
                      return (
                        <span key={slot.id} className="flex h-8 min-w-0 items-center justify-between gap-2 rounded-lg border border-[#ece5de] bg-[#fbf9f7] px-2.5 text-xs font-medium text-[#514844]">
                          <span className="shrink-0 whitespace-nowrap tabular-nums">{formatTime(slot.startMinute)} – {formatTime(slot.endMinute)}</span>
                          <span title={offering ? undefined : "Course information unavailable"} className={`text-right text-[11px] font-semibold text-[#7d1f2a] ${offering ? "shrink-0 whitespace-nowrap" : "min-w-0 break-words"}`}>
                            {offering ? offering.course.code : "Course information unavailable"}
                          </span>
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