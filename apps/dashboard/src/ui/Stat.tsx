// Stats. StatHero = headline KPI card (label / big proportional figure / muted
// sub-line). StatStrip = one card holding a row of compact secondary metrics —
// use it instead of a wall of identical tiles so the page keeps hierarchy.
// A `delta` renders a period-over-period ▲/▼ chip (see Delta.tsx).
import { Card } from "./Card.tsx";
import { Delta, type DeltaSpec } from "./Delta.tsx";

export interface StatItem {
  label: string;
  value: string;
  /** Full-precision value or derivation, shown on hover. */
  title?: string;
  /** Muted line under a hero value (e.g. "$1.82 per active user"). */
  sub?: string;
  /** Period-over-period change vs the prior equal-length range. */
  delta?: DeltaSpec | null;
}

export function StatHeroGrid({ stats }: { stats: StatItem[] }) {
  return (
    <div className="stat-hero-grid">
      {stats.map((s) => (
        <Card className="stat-hero" key={s.label}>
          <div className="stat-label" title={s.title}>
            {s.label}
          </div>
          <div className="stat-value-row">
            <div className="stat-value" title={s.title}>
              {s.value}
            </div>
            {s.delta !== undefined && <Delta spec={s.delta} />}
          </div>
          {s.sub && <div className="stat-sub">{s.sub}</div>}
        </Card>
      ))}
    </div>
  );
}

export function StatStrip({ stats }: { stats: StatItem[] }) {
  return (
    <Card className="stat-strip">
      {stats.map((s) => (
        <div className="stat-strip-item" key={s.label} title={s.title}>
          <div className="stat-strip-label">{s.label}</div>
          <div className="stat-strip-value-row">
            <div className="stat-strip-value">{s.value}</div>
            {s.delta !== undefined && <Delta spec={s.delta} />}
          </div>
        </div>
      ))}
    </Card>
  );
}
