// Filter state lives in the URL (?org=&from=&to=) so views are shareable and
// back/forward works. Dates are 'YYYY-MM-DD'; defaults are last 30 days.
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export interface Filters {
  org: string;
  from: string;
  to: string;
  setOrg: (org: string) => void;
  setRange: (from: string, to: string) => void;
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  return ymd(new Date(Date.now() - n * 86_400_000));
}

export function useFilters(): Filters {
  const [params, setParams] = useSearchParams();
  const org = params.get("org") ?? "";
  const from = params.get("from") || daysAgo(30);
  const to = params.get("to") || ymd(new Date());

  const setOrg = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("org", next);
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set("from", nextFrom);
        p.set("to", nextTo);
        return p;
      });
    },
    [setParams],
  );

  return useMemo(
    () => ({ org, from, to, setOrg, setRange }),
    [org, from, to, setOrg, setRange],
  );
}
