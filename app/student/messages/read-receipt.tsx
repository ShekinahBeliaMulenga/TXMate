const SVG_PROPS = {
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * Delivery indicator for the current user's own last message:
 * one grey tick = sent, two light-blue ticks = seen by the other person.
 */
export function ReadReceipt({ seen }: { seen: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center ${seen ? "text-sky-500" : "text-[#a99d95]"}`}>
      {seen ? (
        <svg {...SVG_PROPS} viewBox="0 0 16 12" className="h-3 w-4">
          <path d="M1 6.5 4.2 9.5 10 2.5M6 6.5 9.2 9.5 15 2.5" />
        </svg>
      ) : (
        <svg {...SVG_PROPS} viewBox="0 0 12 12" className="h-3 w-3">
          <path d="m2 6.5 2.5 2.5L10 3" />
        </svg>
      )}
      <span className="sr-only">{seen ? "Seen" : "Sent"}</span>
    </span>
  );
}
