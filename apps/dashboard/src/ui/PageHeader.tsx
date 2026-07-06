// Drill-down page header: muted breadcrumb back to the parent list, entity
// title (mono for hashes/ids), optional meta line. Links keep the query string.
import { Link } from "react-router-dom";

export function PageHeader({
  kicker,
  kickerTo,
  search,
  title,
  mono,
  meta,
}: {
  /** Parent list label, e.g. "People". */
  kicker?: string;
  kickerTo?: string;
  search?: string;
  title: string;
  /** Render the title in monospace (hashes, model ids). */
  mono?: boolean;
  meta?: string;
}) {
  return (
    <div className="page-head">
      {kicker && (
        <div className="page-kicker">
          {kickerTo ? <Link to={{ pathname: kickerTo, search }}>‹ {kicker}</Link> : kicker}
        </div>
      )}
      <h1 className={mono ? "page-title mono" : "page-title"}>{title}</h1>
      {meta && <div className="page-meta">{meta}</div>}
    </div>
  );
}
