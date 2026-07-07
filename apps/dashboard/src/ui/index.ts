// The dashboard's base UI kit. Pages compose these — see apps/dashboard/README.md.
export { Card, CardHeader } from "./Card.tsx";
export { Section, Grid } from "./Section.tsx";
export { StatHeroGrid, StatStrip, type StatItem } from "./Stat.tsx";
export { Delta, toDelta, type DeltaSpec } from "./Delta.tsx";
export { BarList, type BarRow } from "./BarList.tsx";
export { DataTable, type Column } from "./Table.tsx";
export { PageHeader } from "./PageHeader.tsx";
export { Empty, EmptyPage } from "./EmptyState.tsx";
export {
  ChartTip,
  type TipRow,
  SERIES_SLOTS,
  OTHER_COLOR,
  axisTick,
  gridStroke,
  lineCursor,
  barCursor,
  chartMargin,
} from "./chart.tsx";
