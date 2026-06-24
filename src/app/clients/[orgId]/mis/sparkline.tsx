// sparkline.tsx — pure inline-SVG mini bar chart for the MoM trend. Server-rendered (no client JS),
// so it appears identically on screen and is mirrored in the PDF. Values come straight from the
// engine (present.trendSeries) — no recomputation.
export function Sparkline({ values, width = 140, height = 40 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(...values.map((v) => Math.abs(v)), 1);
  const n = Math.max(values.length, 1);
  const slot = width / n;
  const pad = 3;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden>
      {values.map((v, i) => {
        const h = Math.max((Math.abs(v) / max) * (height - pad), 1);
        return (
          <rect
            key={i}
            x={i * slot + slot * 0.22}
            y={height - h}
            width={slot * 0.56}
            height={h}
            rx={2}
            fill={v < 0 ? '#dc2626' : '#047857'}
            opacity={i === values.length - 1 ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}
