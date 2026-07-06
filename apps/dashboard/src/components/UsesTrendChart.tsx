// Uses per day — count of a discrete event per day => column chart, one series,
// one hue (slot 1). ONE y-axis (the count). A second per-day measure (success
// rate, tokens) is NOT a second scale: it rides along in the per-bar tooltip as
// an extra row. Reused by ToolDetail (uses + success rate) and AgentDetail
// (runs + tokens). A single day renders as one visible bar.
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { int } from "../lib/format.ts";
import { ChartTip, type TipRow, axisTick, gridStroke, barCursor, chartMargin } from "../ui/index.ts";

export interface UsesTrendRow {
  day: string;
  value: number;
  extra?: TipRow[];
}

const dayTick = (d: string) => (d.length >= 10 ? d.slice(5) : d);

function makeTip(label: string) {
  return function UsesTip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as UsesTrendRow;
    const rows: TipRow[] = [{ value: int(d.value), name: label }, ...(d.extra ?? [])];
    return <ChartTip x={d.day} rows={rows} />;
  };
}

export function UsesTrendChart({ rows, label }: { rows: UsesTrendRow[]; label: string }) {
  if (!rows.length || rows.every((r) => r.value === 0))
    return <p className="empty">No data in range</p>;
  const data = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const Tip = makeTip(label);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={chartMargin}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={dayTick}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={int}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={48}
          allowDecimals={false}
        />
        <Tooltip cursor={barCursor} content={<Tip />} />
        <Bar
          dataKey="value"
          fill="var(--series-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={32}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
