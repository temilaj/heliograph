# heliograph dashboard

React SPA served by read-api (Bun bundles `src/index.html` at runtime — no build
step). Pages compose the base UI kit in `src/ui/`; **do not hand-roll cards,
tiles, tables, or bar lists in pages**.

## Structure

```
src/
  ui/          the base kit — import from "../ui/index.ts"
  components/  app-specific chrome & charts (Header, FilterBar, *Chart)
  pages/       one file per route
  lib/         api client, URL-backed filters, number formatting
  theme.css    ALL design tokens + component styles (no inline style except dynamic values)
```

## The kit (`src/ui/`)

| Primitive | Use for |
|---|---|
| `Card`, `CardHeader` | every panel; `sub` = right-aligned muted annotation, `action` slots a control |
| `Section`, `Grid` | page grouping; `Grid cols={2\|3}` responsive card grids |
| `StatHeroGrid` | the 3–4 headline KPIs at the top of a page (big proportional figures) |
| `StatStrip` | secondary metrics in one card — never a wall of identical tiles |
| `BarList` | ranked breakdowns; `to` makes a row a drill-down link, `mono` for hashes |
| `DataTable` | sortable lists (people, models…); `rowLink` + `initialSort`; align `right` for numbers |
| `PageHeader` | drill-down pages: kicker breadcrumb ‹ back, `mono` title for hashes/ids |
| `Empty`, `EmptyPage` | in-panel "No data in range" / whole-route empty |
| `ChartTip`, chart constants | Recharts chrome: `axisTick`, `gridStroke`, `lineCursor`, `barCursor`, `chartMargin`, `SERIES_SLOTS`, `OTHER_COLOR` |

## Rules

- **Tokens only.** Colors, radii, shadows come from `theme.css` custom properties.
  The palette hexes are validated (dataviz method) — never invent or restep them.
  `--accent` is for interactive states; series colors only paint data marks.
- **Charts:** one y-axis, ever. Series hues in fixed slot order (`SERIES_SLOTS`),
  fold past 4 into "Other" (`OTHER_COLOR`). Legend for ≥2 series, none for one.
  Tooltips via `ChartTip` (value first). `isAnimationActive={false}` (headless
  rendering + snapshot validation). Text in text tokens, never series colors.
- **Navigation:** every internal link carries the active query string —
  `useLocation().search` → `to={{ pathname, search }}`. Filters (org/from/to)
  live ONLY in the URL (`useFilters()`).
- **Numbers:** always through `lib/format.ts` (`usd`, `int`, `num`, `compact`,
  `pct`, `truncHash`). Hero figures proportional; `tabular-nums` only in aligned
  columns (the kit handles this). Compact values carry the exact figure in `title=`.
- **Identity is pseudonymous:** show `truncHash(userHash)` with `mono`, full hash
  only in `title=`. Never render emails/names.
- **Loading:** hold the previous render at reduced opacity (`.loading-dim`,
  opacity 0.6) — no skeletons, no layout jumps. Empty ≠ error ≠ loading: three
  distinct states on every page.
- **New page checklist:** route in `App.tsx` (+ the path in read-api's SPA route
  map), `PageHeader` with kicker back-link, fetch on `org/from/to` change with a
  `live` guard, compose kit primitives, verify light AND dark screenshots.
