import { Star } from "./review-form";

const STARS = [5, 4, 3, 2, 1] as const;

/** Compact overall rating and rating distribution. */
export default function RatingSummary({
  average,
  count,
  distribution,
}: {
  average: number | null;
  count: number;
  distribution?: Partial<Record<string, number>>;
}) {
  if (count <= 0 || average === null) return null;

  const rounded = Math.round(average);

  return (
    <div
      className="mb-3 flex items-center gap-3 rounded-lg bg-[#faf7f5] p-2.5 sm:gap-5 sm:p-3"
      aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} ${
        count === 1 ? "review" : "reviews"
      }`}
    >
      <div className="flex w-16 shrink-0 flex-col items-center sm:w-24">
        <p className="text-2xl font-semibold leading-none tracking-tight text-[#282321] tabular-nums sm:text-3xl">
          {average.toFixed(1)}
        </p>

        <div className="mt-1 flex items-center gap-0.5" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} filled={n <= rounded} className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          ))}
        </div>

        <p className="mt-0.5 text-center text-[10px] text-[#756b65] sm:text-[11px]">
          {count} {count === 1 ? "review" : "reviews"}
        </p>
      </div>

      {distribution && (
        <ul className="min-w-0 flex-1 space-y-1">
          {STARS.map((n) => {
            const value = distribution[String(n)] ?? 0;
            const percent = Math.min(100, Math.round((value / count) * 100));

            return (
              <li key={n} className="flex items-center gap-1.5 text-[10px] text-[#625954] sm:text-[11px]">
                <span className="w-2.5 text-right tabular-nums">{n}</span>

                <Star filled className="h-2.5 w-2.5 shrink-0" />

                <span
                  className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#ece5de]"
                  role="img"
                  aria-label={`${value} ${value === 1 ? "review" : "reviews"} with ${n} stars`}
                >
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} />
                </span>

                <span className="w-5 text-right tabular-nums text-[#9a8e86]">{value}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}