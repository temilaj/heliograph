// Filter row above content: date range first, then org select. State is the URL.
import { useEffect, useRef, useState } from "react";
import { useFilters, ymd, daysAgo } from "../lib/filters.tsx";
import { fetchOrgs } from "../lib/api.ts";
import type { OrgInfo } from "@heliograph/storage";

export function FilterBar() {
  return (
    <div className="filter-row">
      <DateRangePicker />
      <OrgSelect />
    </div>
  );
}

// --- org select: loads orgs, auto-selects the most recent when URL has none ---
function OrgSelect() {
  const { org, setOrg } = useFilters();
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    fetchOrgs()
      .then((list) => {
        if (!live) return;
        setOrgs(list);
        if (!org && list[0]) setOrg(list[0].orgId);
      })
      .catch(() => live && setOrgs([]))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [org, setOrg]);

  if (loaded && orgs.length === 0) {
    return (
      <span className="select-wrap">
        <select className="select" disabled>
          <option>(no orgs yet)</option>
        </select>
      </span>
    );
  }

  return (
    <span className="select-wrap">
      <select
        className="select"
        value={org}
        onChange={(e) => setOrg(e.target.value)}
        aria-label="Organization"
      >
        {!org && <option value="">Select org…</option>}
        {orgs.map((o) => (
          <option key={o.orgId} value={o.orgId}>
            {o.orgId}
          </option>
        ))}
      </select>
    </span>
  );
}

// --- date range: button + popover of presets and a custom range ---
interface Preset {
  label: string;
  range: () => { from: string; to: string };
}

const PRESETS: Preset[] = [
  { label: "Last 7 days", range: () => ({ from: daysAgo(7), to: ymd(new Date()) }) },
  { label: "Last 30 days", range: () => ({ from: daysAgo(30), to: ymd(new Date()) }) },
  { label: "Last 90 days", range: () => ({ from: daysAgo(90), to: ymd(new Date()) }) },
  {
    label: "Month to date",
    range: () => {
      const now = new Date();
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { from: ymd(first), to: ymd(now) };
    },
  },
];

function DateRangePicker() {
  const { from, to, setRange } = useFilters();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setCustomFrom(from);
    setCustomTo(to);
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, from, to]);

  const activeLabel = PRESETS.find((p) => {
    const r = p.range();
    return r.from === from && r.to === to;
  })?.label;

  const pick = (r: { from: string; to: string }) => {
    setRange(r.from, r.to);
    setOpen(false);
  };

  return (
    <div className="range" ref={ref}>
      <button className="control" onClick={() => setOpen((v) => !v)} aria-label="Date range">
        <svg className="control-icon" width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="1" y="2.5" width="12" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <line x1="1" y1="5.8" x2="13" y2="5.8" stroke="currentColor" strokeWidth="1.3" />
          <line x1="4.4" y1="0.8" x2="4.4" y2="3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="9.6" y1="0.8" x2="9.6" y2="3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        {activeLabel ?? `${from} → ${to}`}
      </button>
      {open && (
        <div className="range-popover" role="menu">
          {PRESETS.map((p) => {
            const active = p.label === activeLabel;
            return (
              <button
                key={p.label}
                className="range-preset"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => pick(p.range())}
              >
                <span className="range-check">{active ? "✓" : ""}</span>
                {p.label}
              </button>
            );
          })}
          <div className="range-footer">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            <button
              className="range-apply"
              disabled={!customFrom || !customTo}
              onClick={() => pick({ from: customFrom, to: customTo })}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
