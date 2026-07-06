// Ranked-breakdown bar list: thin single-hue bars on a quiet track, label left,
// tabular value right. Rows with `to` are drill-down links (ghost-wash hover,
// accent label, trailing ›). Single series => one hue for every bar — a value
// ramp on nominal categories would double-encode length as color.
// Values are readable without hover; title= only backs up truncated labels.
import { Link } from "react-router-dom";

export interface BarRow {
  key: string;
  label: string; // display label (may be truncated)
  title?: string; // full text for the hover/truncation tooltip
  value: number; // drives the bar width
  valueText: string; // formatted right-hand readout
  to?: string; // drill-down pathname; pass the active `search` alongside
  mono?: boolean; // monospace label (hashes, ids)
}

export function BarList({ rows, search }: { rows: BarRow[]; search?: string }) {
  if (!rows.length) return <p className="empty">No data in range</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="barlist">
      {rows.map((r) => {
        const width = `${((r.value / max) * 100).toFixed(1)}%`;
        const inner = (
          <>
            <span className={r.mono ? "barlist-label mono" : "barlist-label"}>{r.label}</span>
            <span className="barlist-track">
              <span className="barlist-fill" style={{ width }} />
            </span>
            <span className="barlist-value">{r.valueText}</span>
          </>
        );
        const title = r.title ?? r.label;
        return r.to ? (
          <Link
            key={r.key}
            className="barlist-row barlist-link"
            to={{ pathname: r.to, search }}
            title={title}
          >
            {inner}
          </Link>
        ) : (
          <div key={r.key} className="barlist-row" title={title}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
