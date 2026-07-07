// Period-over-period delta chip: ▲/▼ + magnitude vs the prior equal-length range.
// `good` colors it (green/red); omit `good` for a neutral figure where more isn't
// inherently better (raw cost, tokens). `pct` is a signed fraction (-0.3 = −30%).
// Turns a bare number into a verdict — the comparison layer's core primitive.
import { pct as fmtPct } from "../lib/format.ts";

export interface DeltaSpec {
  pct: number; // signed fraction vs prior, e.g. -0.3
  good?: boolean; // true → green, false → red, undefined → neutral
}

/** Compute a DeltaSpec from current/prior. `betterWhenLower` flips the good sense.
 *  Returns null when prior is 0 (no baseline — "new", not a delta). */
export function toDelta(current: number, prior: number, betterWhenLower = false): DeltaSpec | null {
  if (!prior) return null;
  const change = (current - prior) / prior;
  if (Math.abs(change) < 0.0005) return { pct: 0 }; // flat → neutral, no arrow noise
  const good = betterWhenLower ? change < 0 : change > 0;
  return { pct: change, good };
}

export function Delta({ spec }: { spec: DeltaSpec | null }) {
  if (!spec) return null;
  const flat = spec.pct === 0;
  const cls =
    "delta " + (flat ? "delta-flat" : spec.good === undefined ? "delta-neutral" : spec.good ? "delta-good" : "delta-bad");
  const arrow = flat ? "→" : spec.pct > 0 ? "▲" : "▼";
  return (
    <span className={cls} title={`${fmtPct(spec.pct * 100, 1)} vs prior period`}>
      {arrow} {fmtPct(Math.abs(spec.pct) * 100, spec.pct === 0 ? 0 : 1)}
    </span>
  );
}
