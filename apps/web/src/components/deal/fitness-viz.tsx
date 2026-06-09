/**
 * Deal Fitness visualization primitives — pure-SVG, server-renderable,
 * design-token colors only (Guardrail: no inline hex outside the token
 * scales; SVG stroke/fill use the same hexes as tailwind.config.ts scales).
 *
 * v1-parity treatment: score ring (overall), mini fit bars (per-dimension
 * table cells), 4-axis fit-balance radar.
 */

const SCALE = {
  // tailwind.config.ts hexes — single source mirrored here because SVG
  // attributes can't consume CSS utility classes.
  signal500: "#4F5FE0",
  signal200: "#BCC3FD",
  success: "#15803D",
  successLight: "#DCFCE7",
  warning: "#D97706",
  warningLight: "#FEF3C7",
  error: "#DC2626",
  errorLight: "#FEE2E2",
  track: "#E1E7EF", // slate-100
  axis: "#C4CEDA", // slate-200
} as const;

export function scoreTone(score: number | null): {
  stroke: string;
  fill: string;
  text: string;
} {
  if (score === null) return { stroke: SCALE.track, fill: SCALE.track, text: "text-tertiary" };
  if (score >= 70) return { stroke: SCALE.success, fill: SCALE.successLight, text: "text-success" };
  if (score >= 40) return { stroke: SCALE.warning, fill: SCALE.warningLight, text: "text-warning" };
  return { stroke: SCALE.error, fill: SCALE.errorLight, text: "text-error" };
}

export function ScoreRing({
  score,
  size = 72,
  strokeWidth = 6,
  label,
}: {
  score: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const tone = scoreTone(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} role="img" aria-label={`Overall score ${score ?? "—"}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={SCALE.track}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-current"
          fontSize={size / 3}
          fontWeight={600}
        >
          {score ?? "—"}
        </text>
      </svg>
      {label && <span className="text-tertiary text-xs">{label}</span>}
    </div>
  );
}

export function FitBar({
  label,
  score,
}: {
  label: string;
  score: number | null;
}) {
  const tone = scoreTone(score);
  const pct = Math.max(0, Math.min(100, score ?? 0));
  return (
    <div className="flex w-24 flex-col gap-0.5">
      <svg width="96" height="6" role="img" aria-label={`${label} ${score ?? "—"}`}>
        <rect width="96" height="6" rx="3" fill={SCALE.track} />
        <rect width={Math.max(4, (96 * pct) / 100)} height="6" rx="3" fill={tone.stroke} />
      </svg>
      <span className="text-tertiary text-xs tabular-nums">
        {label}: {score ?? "—"}%
      </span>
    </div>
  );
}

/**
 * 4-axis fit-balance radar (Business top, Technical right, Readiness
 * bottom, Emotional left) — the v1 "Fit Balance" diamond.
 */
export function FitnessRadar({
  business,
  emotional,
  technical,
  readiness,
  size = 360,
}: {
  business: number | null;
  emotional: number | null;
  technical: number | null;
  readiness: number | null;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const rMax = size / 2 - 64;
  const axes = [
    { key: "Business", value: business, angle: -90 },
    { key: "Technical", value: technical, angle: 0 },
    { key: "Readiness", value: readiness, angle: 90 },
    { key: "Emotional", value: emotional, angle: 180 },
  ];
  const pt = (angleDeg: number, radius: number): [number, number] => {
    const a = (angleDeg * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  };
  const polygon = axes
    .map((a) => pt(a.angle, (rMax * Math.max(0, Math.min(100, a.value ?? 0))) / 100))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const gridLevels = [0.25, 0.5, 0.75, 1];
  return (
    <svg
      width={size}
      height={size}
      role="img"
      aria-label="Fit balance radar"
      className="mx-auto"
    >
      {gridLevels.map((g) => (
        <polygon
          key={g}
          points={axes
            .map((a) => pt(a.angle, rMax * g))
            .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
            .join(" ")}
          fill="none"
          stroke={SCALE.axis}
          strokeWidth={1}
        />
      ))}
      {axes.map((a) => {
        const [x, y] = pt(a.angle, rMax);
        return (
          <line key={a.key} x1={cx} y1={cy} x2={x} y2={y} stroke={SCALE.axis} strokeWidth={1} />
        );
      })}
      <polygon
        points={polygon}
        fill={SCALE.signal200}
        fillOpacity={0.45}
        stroke={SCALE.signal500}
        strokeWidth={2}
      />
      {axes.map((a) => {
        const [x, y] = pt(a.angle, (rMax * Math.max(0, Math.min(100, a.value ?? 0))) / 100);
        return <circle key={a.key} cx={x} cy={y} r={4} fill={SCALE.signal500} />;
      })}
      {axes.map((a) => {
        const [x, y] = pt(a.angle, rMax + 34);
        return (
          <text
            key={a.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-current"
          >
            <tspan x={x} dy="-0.4em" fontSize={13} fontWeight={600}>
              {a.key}
            </tspan>
            <tspan x={x} dy="1.3em" fontSize={12}>
              {a.value ?? "—"}%
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
