import type { Slice } from "@/lib/admin/analytics-types";

/** TXMate's report colours: the maroon first, then calm accents that stay apart on a white card. */
export const PALETTE = ["#7d1f2a", "#d4a02f", "#2f8f6e", "#3f6f9f", "#a86b8c", "#8a8178", "#d9794a", "#5aa6a0"] as const;
const INK = "#1f1a17", MUTED = "#6b635d", GRID = "#ece7e1", TRACK = "#f1ede8";

const nice = (max: number) => {
  if (max <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const unit = [1, 2, 2.5, 5, 10].map((m) => m * step).find((candidate) => candidate * 4 >= max) ?? 10 * step;
  return unit * 4;
};

/** A smooth line through the points that never overshoots them (monotone cubic). */
function smooth(points: Array<[number, number]>): string {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : "";
  const n = points.length, dx: number[] = [], slope: number[] = [], tangent: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(points[i + 1][0] - points[i][0]); slope.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1)); }
  tangent.push(slope[0]);
  for (let i = 1; i < n - 1; i++) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
    const a = tangent[i] / slope[i], b = tangent[i + 1] / slope[i], h = Math.hypot(a, b);
    if (h > 3) { tangent[i] = (3 * a * slope[i]) / h; tangent[i + 1] = (3 * b * slope[i]) / h; }
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) d += ` C${points[i][0] + dx[i] / 3},${points[i][1] + (tangent[i] * dx[i]) / 3} ${points[i + 1][0] - dx[i] / 3},${points[i + 1][1] - (tangent[i + 1] * dx[i]) / 3} ${points[i + 1][0]},${points[i + 1][1]}`;
  return d;
}

/** Tiny trend line for a KPI card. */
export function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const W = 120, H = 32, max = Math.max(1, ...values);
  const pts = values.map((value, i): [number, number] => [values.length === 1 ? W / 2 : (i * W) / (values.length - 1), H - 3 - (value / max) * (H - 8)]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-8 w-full" preserveAspectRatio="none">
      <path d={`${smooth(pts)} L${W},${H} L0,${H} Z`} fill={color} opacity="0.12" />
      <path d={smooth(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Smooth area chart with soft gridlines, a gradient under each line and a legend. Pure SVG, so it renders on the server. */
export function AreaChart({ id, labels, series, label }: { id: string; labels: string[]; series: Array<{ name: string; values: number[]; color: string }>; label: string }) {
  const W = 640, H = 250, L = 34, R = 10, T = 12, B = 28;
  const top = nice(Math.max(1, ...series.flatMap((item) => item.values)));
  const x = (i: number) => (labels.length === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (labels.length - 1));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const every = Math.ceil(labels.length / 8);
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
        <defs>{series.map((item, i) => <linearGradient key={item.name} id={`${id}-${i}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={item.color} stopOpacity="0.28" /><stop offset="100%" stopColor={item.color} stopOpacity="0" /></linearGradient>)}</defs>
        {[0, 1, 2, 3, 4].map((tick) => { const value = (top / 4) * tick; return <g key={tick}><line x1={L} x2={W - R} y1={y(value)} y2={y(value)} stroke={GRID} strokeDasharray={tick === 0 ? undefined : "3 4"} /><text x={L - 8} y={y(value) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{Number.isInteger(value) ? value : value.toFixed(1)}</text></g>; })}
        {labels.map((text, i) => (i % every === 0 ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={MUTED}>{text}</text> : null))}
        {series.map((item, s) => {
          const pts = item.values.map((v, i): [number, number] => [x(i), y(v)]);
          return (
            <g key={item.name}>
              <path d={`${smooth(pts)} L${x(labels.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id}-${s})`} />
              <path d={smooth(pts)} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" />
              {item.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={labels.length > 14 ? 2.5 : 3.5} fill="#fff" stroke={item.color} strokeWidth="2"><title>{`${item.name}, week of ${labels[i]}: ${v}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6b635d]">
        {series.map((item) => <span key={item.name} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}</span>)}
      </figcaption>
    </figure>
  );
}

/** Circular progress for a share (0 to 1). */
export function Ring({ value, color, label }: { value: number | null; color: string; label: string }) {
  const R = 34, C = 2 * Math.PI * R, shown = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <svg viewBox="0 0 84 84" role="img" aria-label={label} className="h-20 w-20 shrink-0">
      <circle cx="42" cy="42" r={R} fill="none" stroke={TRACK} strokeWidth="9" />
      {shown > 0 ? <circle cx="42" cy="42" r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${shown * C} ${C}`} transform="rotate(-90 42 42)" /> : null}
      <text x="42" y="47" textAnchor="middle" fontSize="16" fontWeight="600" fill={INK}>{value === null ? "–" : `${Math.round(value * 100)}%`}</text>
    </svg>
  );
}

/** Donut with the total in the middle and a legend that shows each value and share. */
export function Donut({ slices, centerLabel, label, colors }: { slices: Slice[]; centerLabel: string; label: string; colors?: Record<string, string> }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const R = 50, C = 2 * Math.PI * R, GAP = slices.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  const color = (slice: Slice, i: number) => colors?.[slice.label] ?? PALETTE[i % PALETTE.length];
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <svg viewBox="0 0 140 140" role="img" aria-label={label} className="h-36 w-36 shrink-0">
        <circle cx="70" cy="70" r={R} fill="none" stroke={TRACK} strokeWidth="16" />
        {total > 0 ? slices.map((slice, i) => {
          const length = (slice.value / total) * C;
          const node = slice.value > 0 ? <circle key={slice.label} cx="70" cy="70" r={R} fill="none" stroke={color(slice, i)} strokeWidth="16" strokeDasharray={`${Math.max(0, length - GAP)} ${C - Math.max(0, length - GAP)}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)"><title>{`${slice.label}: ${slice.value}`}</title></circle> : null;
          offset += length;
          return node;
        }) : null}
        <text x="70" y="69" textAnchor="middle" fontSize="24" fontWeight="600" fill={INK}>{total}</text>
        <text x="70" y="86" textAnchor="middle" fontSize="10" fill={MUTED}>{centerLabel}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[13px]">
        {slices.map((slice, i) => (
          <li key={slice.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color(slice, i) }} /><span className="break-words text-[#3a332f]">{slice.label}</span></span>
            <span className="shrink-0 tabular-nums text-[#6b635d]"><span className="font-semibold text-[#1f1a17]">{slice.value}</span>{total > 0 ? ` · ${Math.round((slice.value / total) * 100)}%` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal rounded bars; labels wrap, never cut off. */
export function HBars({ items, color = PALETTE[0], unit = "" }: { items: Array<{ label: string; sub?: string; value: number }>; color?: string; unit?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} className="text-[13px]">
          <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 break-words text-[#1f1a17]"><span className="font-semibold">{item.label}</span>{item.sub ? <span className="text-[#6b635d]"> {item.sub}</span> : null}</span><span className="shrink-0 font-semibold tabular-nums">{item.value}{unit}</span></div>
          <div className="mt-1.5 h-2 rounded-full bg-[#f1ede8]"><div className="h-2 rounded-full" style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: color }} /></div>
        </li>
      ))}
    </ul>
  );
}
