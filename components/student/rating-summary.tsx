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
      className="mb-4 flex items-center gap-3 rounded-xl bg-[#faf7f5] p-3 sm:gap-6 sm:p-4"
      aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} ${
        count === 1 ? "review" : "reviews"
      }`}
    >
      <div className="flex w-[76px] shrink-0 flex-col items-center sm:w-28">
        <p className="text-3xl font-semibold leading-none tracking-tight text-[#282321] tabular-nums sm:text-4xl">
          {average.toFixed(1)}
        </p>

        <div
          className="mt-1.5 flex items-center gap-0.5"
          aria-hidden="true"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              filled={n <= rounded}
              className="h-3.5 w-3.5 sm:h-4 sm:w-4"
            />
          ))}
        </div>

        <p className="mt-1 text-center text-[11px] text-[#756b65]">
          {count} {count === 1 ? "review" : "reviews"}
        </p>
      </div>

      {distribution && (
        <ul className="min-w-0 flex-1 space-y-1.5">
          {STARS.map((n) => {
            const value = distribution[String(n)] ?? 0;
            const percent = Math.min(100, Math.round((value / count) * 100));

            return (
              <li
                key={n}
                className="flex items-center gap-1.5 text-[11px] text-[#625954] sm:gap-2 sm:text-xs"
              >
                <span className="w-2.5 text-right tabular-nums">{n}</span>

                <Star filled className="h-3 w-3 shrink-0" />

                <span
                  className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#ece5de] sm:h-2"
                  role="img"
                  aria-label={`${value} ${
                    value === 1 ? "review" : "reviews"
                  } with ${n} stars`}
                >
                  <span
                    className="block h-full rounded-full bg-amber-400"
                    style={{ width: `${percent}%` }}
                  />
                </span>

                <span className="w-5 text-right tabular-nums text-[#9a8e86]">
                  {value}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}