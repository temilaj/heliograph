// Activity by hour (UTC) — requests per hour-of-day => column chart, one series,
// one hue (slot 1). ONE y-axis (requests). Cost is a second measure, so it lives
// in the per-bar tooltip — never a second y-scale. Each bar is its own hit target.
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { usd, int } from "../lib/format.ts";
import { ChartTip, axisTick, gridStroke, barCursor, chartMargin } from "../ui/index.ts";

interface HourRow {
  hour: number;
  requests: number;
  cost: number;
}

const hh = (h: number) => String(h).padStart(2, "0");

function HourTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as HourRow;
  return (
    <ChartTip
      x={`${hh(d.hour)}:00 UTC`}
      rows={[
        { value: int(d.requests), name: "requests" },
        { value: usd(d.cost), name: "cost" },
      ]}
    />
  );
}

export function ActivityHourChart({ rows }: { rows: HourRow[] }) {
  // Fill all 24 hours so the axis is a complete clock even where a bar is zero.
  const map = new Map(rows.map((r) => [r.hour, r]));
  const data: HourRow[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    requests: map.get(h)?.requests ?? 0,
    cost: map.get(h)?.cost ?? 0,
  }));
  if (data.every((d) => d.requests === 0)) return <p className="empty">No data in range</p>;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={chartMargin}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={hh}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          interval={1}
        />
        <YAxis
          tickFormatter={int}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={40}
          allowDecimals={false}
        />
        <Tooltip cursor={barCursor} content={<HourTip />} />
        <Bar
          dataKey="requests"
          fill="var(--series-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
