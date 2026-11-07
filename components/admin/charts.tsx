import type { Slice } from "@/lib/admin/analytics-types";

/** The classic Power BI palette, used in order so a report reads the same everywhere. */
export const PBI = ["#01B8AA", "#374649", "#FD625E", "#F2C80F", "#5F6B6D", "#8AD4EB", "#FE9666", "#A66999"] as const;

const nice = (max: number) => {
  if (max <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const unit = [1, 2, 2.5, 5, 10].map((m) => m * step).find((candidate) => candidate * 4 >= max) ?? 10 * step;
  return unit * 4;
};

/** Multi-series line chart with gridlines, markers and a legend. Pure SVG, so it renders on the server. */
export function LineChart({ labels, series, label }: { labels: string[]; series: Array<{ name: string; values: number[]; color: string }>; label: string }) {
  const W = 640, H = 240, L = 40, R = 12, T = 12, B = 30;
  const top = nice(Math.max(1, ...series.flatMap((item) => item.values)));
  const x = (index: number) => (labels.length === 1 ? L + (W - L - R) / 2 : L + (index * (W - L - R)) / (labels.length - 1));
  const y = (value: number) => T + (1 - value / top) * (H - T - B);
  const every = Math.ceil(labels.length / 8);
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = (top / 4) * tick;
          return (
            <g key={tick}>
              <line x1={L} x2={W - R} y1={y(value)} y2={y(value)} stroke="#e1dfdd" strokeWidth="1" />
              <text x={L - 6} y={y(value) + 4} textAnchor="end" fontSize="11" fill="#605e5c">{Number.isInteger(value) ? value : value.toFixed(1)}</text>
            </g>
          );
        })}
        {labels.map((text, index) => (index % every === 0 ? <text key={index} x={x(index)} y={H - 10} textAnchor="middle" fontSize="11" fill="#605e5c">{text}</text> : null))}
        {series.map((item) => (
          <g key={item.name}>
            <polyline fill="none" stroke={item.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} />
            {item.values.map((value, index) => (<circle key={index} cx={x(index)} cy={y(value)} r="3.5" fill="#fff" stroke={item.color} strokeWidth="2"><title>{`${item.name}, week of ${labels[index]}: ${value}`}</title></circle>))}
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#605e5c]">
        {series.map((item) => <span key={item.name} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}</span>)}
      </figcaption>
    </figure>
  );
}

/** Donut with the total in the middle and a legend that shows each value and share. */
export function Donut({ slices, centerLabel, label }: { slices: Slice[]; centerLabel: string; label: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const R = 52, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <svg viewBox="0 0 140 140" role="img" aria-label={label} className="h-36 w-36 shrink-0">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#edebe9" strokeWidth="22" />
        {total > 0 ? slices.map((slice, index) => {
          const length = (slice.value / total) * C;
          const node = slice.value > 0 ? <circle key={slice.label} cx="70" cy="70" r={R} fill="none" stroke={PBI[index % PBI.length]} strokeWidth="22" strokeDasharray={`${length} ${C - length}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)"><title>{`${slice.label}: ${slice.value}`}</title></circle> : null;
          offset += length;
          return node;
        }) : null}
        <text x="70" y="68" textAnchor="middle" fontSize="22" fontWeight="600" fill="#201f1e">{total}</text>
        <text x="70" y="85" textAnchor="middle" fontSize="10" fill="#605e5c">{centerLabel}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-[13px]">
        {slices.map((slice, index) => (
          <li key={slice.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PBI[index % PBI.length] }} /><span className="break-words text-[#323130]">{slice.label}</span></span>
            <span className="shrink-0 tabular-nums text-[#605e5c]"><span className="font-semibold text-[#201f1e]">{slice.value}</span>{total > 0 ? ` · ${Math.round((slice.value / total) * 100)}%` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Vertical columns with the value above each one. */
export function Columns({ items, color = PBI[0], label }: { items: Array<{ label: string; value: number }>; color?: string; label: string }) {
  const W = 320, H = 180, B = 24, T = 18;
  const max = Math.max(1, ...items.map((item) => item.value));
  const slot = W / items.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
      <line x1="0" x2={W} y1={H - B} y2={H - B} stroke="#e1dfdd" />
      {items.map((item, index) => {
        const height = (item.value / max) * (H - B - T);
        return (
          <g key={item.label}>
            <rect x={index * slot + slot * 0.18} y={H - B - height} width={slot * 0.64} height={height} fill={color} rx="2"><title>{`${item.label}: ${item.value}`}</title></rect>
            <text x={index * slot + slot / 2} y={H - B - height - 5} textAnchor="middle" fontSize="11" fill="#201f1e" fontWeight="600">{item.value}</text>
            <text x={index * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#605e5c">{item.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal bars with wrapping labels (never cut off). */
export function HBars({ items, color = PBI[0] }: { items: Array<{ label: string; sub?: string; value: number }>; color?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label} className="text-[13px]">
          <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 break-words text-[#201f1e]"><span className="font-semibold">{item.label}</span>{item.sub ? <span className="text-[#605e5c]"> {item.sub}</span> : null}</span><span className="shrink-0 tabular-nums font-semibold">{item.value}</span></div>
          <div className="mt-1 h-2.5 rounded-sm bg-[#edebe9]"><div className="h-2.5 rounded-sm" style={{ width: `${(item.value / max) * 100}%`, background: color }} /></div>
        </li>
      ))}
    </ul>
  );
}
