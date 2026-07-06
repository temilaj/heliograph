// Sortable data table for drill-down lists (people, models, tools). Click a
// sortable header to toggle desc/asc. `rowLink` makes the whole row navigate
// (the first cell renders a real <Link> for keyboard/a11y); pass the active
// `search` so filters survive navigation. Numeric columns: align "right"
// (tabular-nums applied by CSS).
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Present => column is sortable by this value. */
  sortValue?: (row: T) => number | string;
  align?: "left" | "right";
  /** Full text on hover (e.g. untruncated hash). */
  title?: (row: T) => string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowLink,
  search,
  initialSort,
  emptyText = "No data in range",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowLink?: (row: T) => string;
  search?: string;
  /** Column key to sort by initially (desc). */
  initialSort?: string;
  emptyText?: string;
}) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<string | null>(initialSort ?? null);
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey && c.sortValue);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = sv(a);
      const vb = sv(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return desc ? -cmp : cmp;
    });
  }, [rows, columns, sortKey, desc]);

  if (!rows.length) return <p className="empty">{emptyText}</p>;

  const onSort = (key: string) => {
    if (sortKey === key) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(true);
    }
  };

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => {
              const sortable = Boolean(c.sortValue);
              const active = sortKey === c.key;
              const cls = [c.align === "right" ? "num" : "", sortable ? "sortable" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <th
                  key={c.key}
                  className={cls || undefined}
                  onClick={sortable ? () => onSort(c.key) : undefined}
                  aria-sort={active ? (desc ? "descending" : "ascending") : undefined}
                >
                  {c.header}
                  {active && <span className="sort-arrow">{desc ? "▼" : "▲"}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const to = rowLink?.(row);
            return (
              <tr
                key={rowKey(row)}
                className={to ? "row-link" : undefined}
                onClick={to ? () => navigate({ pathname: to, search }) : undefined}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={c.align === "right" ? "num" : undefined}
                    title={c.title?.(row)}
                  >
                    {to && i === 0 ? (
                      <Link
                        className="cell-link"
                        to={{ pathname: to, search }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.render(row)}
                      </Link>
                    ) : (
                      c.render(row)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
