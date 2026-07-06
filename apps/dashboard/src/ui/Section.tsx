// Page-level grouping: small-caps section head + responsive card grids.
import type { ReactNode } from "react";

export function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {sub && <span className="section-sub">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

/** Responsive grid of cards. cols=3 fits breakdown panels; cols=2 wider ones. */
export function Grid({ cols = 3, children }: { cols?: 2 | 3; children: ReactNode }) {
  return <div className={`grid grid-${cols}`}>{children}</div>;
}
