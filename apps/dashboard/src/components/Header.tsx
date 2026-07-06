// Sticky brand + primary nav. Links preserve the active filter query string.
import { NavLink, useLocation } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/models", label: "Models & Tools", end: false },
  { to: "/capabilities", label: "Capabilities", end: false },
  { to: "/teams", label: "Teams", end: false },
  { to: "/people", label: "People", end: false },
];

// heliograph = "sun writing" — a small sun mark in the accent hue.
function SunGlyph() {
  return (
    <svg className="brand-glyph" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <line x1="8" y1="0.8" x2="8" y2="2.6" />
        <line x1="8" y1="13.4" x2="8" y2="15.2" />
        <line x1="0.8" y1="8" x2="2.6" y2="8" />
        <line x1="13.4" y1="8" x2="15.2" y2="8" />
        <line x1="2.9" y1="2.9" x2="4.2" y2="4.2" />
        <line x1="11.8" y1="11.8" x2="13.1" y2="13.1" />
        <line x1="2.9" y1="13.1" x2="4.2" y2="11.8" />
        <line x1="11.8" y1="4.2" x2="13.1" y2="2.9" />
      </g>
    </svg>
  );
}

export function Header() {
  const { search } = useLocation();
  return (
    <header className="header">
      <div className="header-inner">
        <NavLink to={{ pathname: "/", search }} className="brand">
          <SunGlyph />
          heliograph
        </NavLink>
        <nav className="nav">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={{ pathname: l.to, search }}
              end={l.end}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
