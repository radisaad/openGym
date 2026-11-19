// The running screens' drawings (radi.css): rings, weekly bars, a pace line and the load chart.
// Plain SVG, no library (the app stays dependency-light); each sizes to its card.

/** One progress ring: `value` 0 to 1 (more wraps), `color`, the middle as children. */
export function Ring({ value = 0, size = 92, stroke = 10, color = 'var(--ra-run)', children, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value || 0))
  return <div className="ra-ring" style={{ width: size, height: size }} role="img" aria-label={label}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity=".18" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
    </svg>
    <div className="ra-ring-c">{children}</div>
  </div>
}

const W = 340

/** Weekly bars, running and walking stacked: `weeks` [{ label, run, walk }]. */
export function WeekBars({ weeks, height = 150, unit = 'km', label }) {
  const top = Math.max(1, ...weeks.map(w => w.run + w.walk))
  const pad = 18, bw = (W - 4) / weeks.length
  const y = v => height - pad - (v / top) * (height - pad - 14)
  return <svg className="ra-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
    <line className="grid" x1="0" x2={W} y1={height - pad} y2={height - pad} />
    <text x={W} y="10" textAnchor="end">{Math.round(top)} {unit}</text>
    {weeks.map((w, i) => {
      const x = 2 + i * bw + bw * 0.18, wd = bw * 0.64
      const yr = y(w.run), yw = y(w.run + w.walk)
      return <g key={i}>
        {w.walk > 0 && <rect x={x} y={yw} width={wd} height={Math.max(0, yr - yw)} rx="3" fill="var(--ra-walk)" opacity=".75" />}
        {w.run > 0 && <rect x={x} y={yr} width={wd} height={Math.max(0, height - pad - yr)} rx="3" fill="var(--ra-run)" />}
        {(i === weeks.length - 1 || i % 2 === (weeks.length - 1) % 2) && <text x={x + wd / 2} y={height - 4} textAnchor="middle">{w.label}</text>}
      </g>
    })}
  </svg>
}

/** A line over points [{ x: 0..1, y, label? }]; `invert` puts small values on top (a pace). */
export function LineSeries({ series, height = 150, invert = false, fmt = v => v, label }) {
  const pts = series.flatMap(s => s.points)
  if (!pts.length) return null
  let lo = Math.min(...pts.map(p => p.y)), hi = Math.max(...pts.map(p => p.y))
  if (hi === lo) { hi += 1; lo -= 1 }
  const pad = 14
  const X = x => 8 + x * (W - 16)
  const Y = v => { const f = (v - lo) / (hi - lo); return pad + (invert ? f : 1 - f) * (height - pad * 2) }
  return <svg className="ra-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
    <line className="grid" x1="0" x2={W} y1={Y(invert ? lo : hi)} y2={Y(invert ? lo : hi)} strokeDasharray="3 4" />
    <line className="grid" x1="0" x2={W} y1={Y(invert ? hi : lo)} y2={Y(invert ? hi : lo)} strokeDasharray="3 4" />
    <text x={W} y={Y(invert ? lo : hi) - 4} textAnchor="end">{fmt(invert ? lo : hi)}</text>
    <text x={W} y={Y(invert ? hi : lo) + 12} textAnchor="end">{fmt(invert ? hi : lo)}</text>
    {series.map(s => <g key={s.key}>
      {s.points.length > 1 && <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
        points={s.points.map(p => `${X(p.x)},${Y(p.y)}`).join(' ')} strokeDasharray={s.dash} />}
      {s.dots !== false && s.points.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r="3.5" fill={s.color} />)}
    </g>)}
  </svg>
}
