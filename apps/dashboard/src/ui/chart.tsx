// Shared chart chrome so every Recharts chart reads as one system: recessive
// grid/axes, themed crosshair, and one tooltip component. Colors come through
// CSS variables so dark mode needs no JS. Series hues: fixed slot order
// var(--series-1..8); >4 series fold into "Other" (var(--muted)) — never cycle.
export const SERIES_SLOTS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
] as const;
export const OTHER_COLOR = "var(--muted)";

export const axisTick = { fill: "var(--muted)", fontSize: 11.5 };
export const gridStroke = "var(--grid)";
export const lineCursor = { stroke: "var(--baseline)", strokeWidth: 1 };
export const barCursor = { fill: "var(--grid)", fillOpacity: 0.5 };
export const chartMargin = { top: 8, right: 16, bottom: 0, left: 0 };

export interface TipRow {
  /** Series color key stroke; omit for single-measure tips. */
  color?: string;
  value: string;
  name: string;
}

/** Value-first tooltip card: X label on top, then one row per series. */
export function ChartTip({ x, rows }: { x: string; rows: TipRow[] }) {
  return (
    <div className="chart-tip card">
      <div className="chart-tip-x">{x}</div>
      {rows.map((r) => (
        <div className="chart-tip-row" key={r.name}>
          {r.color && <span className="chart-tip-key" style={{ background: r.color }} />}
          <span className="chart-tip-val">{r.value}</span>
          <span className="chart-tip-name">{r.name}</span>
        </div>
      ))}
    </div>
  );
}
