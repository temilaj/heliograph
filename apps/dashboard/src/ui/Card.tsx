// Card + optional titled header. `sub` is a right-aligned muted annotation
// (units, range, count); `action` slots a control into the header row.
import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `card ${className}` : "card"}>{children}</div>;
}

export function CardHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-head">
      <h3 className="card-title">{title}</h3>
      {sub && <span className="card-sub">{sub}</span>}
      {action}
    </div>
  );
}
