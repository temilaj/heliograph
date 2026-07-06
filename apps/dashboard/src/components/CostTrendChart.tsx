// Cost over time — trend of a continuous measure => line (area for a single
// series). One series per model in FIXED slot order; models past the top 4 fold
// into a neutral "Other" so we never generate a 9th hue. One y-axis (USD).
// Crosshair + one tooltip listing every series at that X. A single day of data
// renders as a visible dot, not an invisible zero-length line.
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { CostTimeseriesRow } from "@heliograph/storage";
import { usd } from "../lib/format.ts";
import {
  ChartTip,
  SERIES_SLOTS,
  OTHER_COLOR,
  axisTick,
  gridStroke,
  lineCursor,
  chartMargin,
} from "../ui/index.ts";

const OTHER = "Other";

interface Series {
  name: string;
  color: string;
}

function pivot(rows: CostTimeseriesRow[]): {
  data: Record<string, number | string>[];
  series: Series[];
} {
  // Rank models by total spend; keep top 4, fold the rest into "Other".
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.model, (totals.get(r.model) ?? 0) + r.cost);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  const top = ranked.slice(0, 4);
  const topSet = new Set(top);
  const hasOther = ranked.length > top.length;

  const series: Series[] = top.map((name, i) => ({ name, color: SERIES_SLOTS[i] ?? OTHER_COLOR }));
  if (hasOther) series.push({ name: OTHER, color: OTHER_COLOR });

  const days = [...new Set(rows.map((r) => r.day))].sort();
  const byDay = new Map<string, Record<string, number | string>>();
  for (const day of days) {
    const seed: Record<string, number | string> = { day };
    for (const s of series) seed[s.name] = 0;
    byDay.set(day, seed);
  }
  for (const r of rows) {
    const rec = byDay.get(r.day)!;
    const bucket = topSet.has(r.model) ? r.model : OTHER;
    rec[bucket] = (rec[bucket] as number) + r.cost;
  }
  return { data: days.map((d) => byDay.get(d)!), series };
}

function CostTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // Every series at this X, value-first (the reader has the series, wants the number).
  const rows = [...payload]
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .map((p) => ({ color: p.color as string, value: usd(p.value ?? 0), name: p.name as string }));
  return <ChartTip x={String(label)} rows={rows} />;
}

const dayTick = (d: string) => (d.length >= 10 ? d.slice(5) : d); // MM-DD

export function CostTrendChart({ rows }: { rows: CostTimeseriesRow[] }) {
  if (!rows.length) return <p className="empty">No data in range</p>;
  const { data, series } = pivot(rows);
  const single = data.length === 1;
  const grid = <CartesianGrid stroke={gridStroke} vertical={false} />;
  const xAxis = (
    <XAxis
      dataKey="day"
      tickFormatter={dayTick}
      tick={axisTick}
      axisLine={false}
      tickLine={false}
      minTickGap={24}
    />
  );
  const yAxis = (
    <YAxis
      tickFormatter={(v: number) => usd(v)}
      tick={axisTick}
      axisLine={false}
      tickLine={false}
      width={64}
    />
  );
  const dot = (color: string) =>
    single
      ? { r: 5, fill: color, fillOpacity: 1, strokeWidth: 2, stroke: "var(--surface)" }
      : false;

  // Single series => area (a 10% wash under a 2px line). Multiple => plain lines.
  if (series.length === 1 && series[0]) {
    const s = series[0];
    return (
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={chartMargin}>
          {grid}
          {xAxis}
          {yAxis}
          <Tooltip cursor={lineCursor} content={<CostTip />} />
          <Area
            type="monotone"
            dataKey={s.name}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            fill={s.color}
            fillOpacity={0.1}
            dot={dot(s.color)}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={chartMargin}>
        {grid}
        {xAxis}
        {yAxis}
        <Tooltip cursor={lineCursor} content={<CostTip />} />
        <Legend
          iconType="plainline"
          formatter={(value) => <span className="chart-legend-item">{value}</span>}
        />
        {series.map((s) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={dot(s.color)}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
