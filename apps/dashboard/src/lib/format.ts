// One formatting module for the whole dashboard so numbers read the same everywhere.
const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const intFmt = new Intl.NumberFormat("en-US");

/** Dollars, always 2dp: 1.8234 -> "$1.82". */
export function usd(n: number): string {
  return usdFmt.format(n);
}

/** Whole number with thousands separators: 1600000 -> "1,600,000". */
export function int(n: number): string {
  return intFmt.format(Math.round(n));
}

/** Number with a fixed number of decimals: num(12.34, 1) -> "12.3". */
export function num(n: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}

const UNITS: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "k"],
];

/** Compact count: 1500 -> "1.5k", 12_000_000 -> "12M". Full value belongs on hover. */
export function compact(n: number): string {
  const a = Math.abs(n);
  for (const [d, s] of UNITS) {
    // 0.9995*d so a value that rounds up (999,999) promotes to the next unit.
    if (a >= d * 0.9995) {
      const v = n / d;
      return (v < 9.995 ? v.toFixed(1).replace(/\.0$/, "") : String(Math.round(v))) + s;
    }
  }
  return String(Math.round(n));
}

/** Percentage from an already-computed 0..100 value: pct(97.3, 0) -> "97%". */
export function pct(n: number, digits = 0): string {
  return `${num(n, digits)}%`;
}

/** Pseudonymous identity — never show a full hash. abcdef0123456789 -> "abcdef0123…". */
export function truncHash(h: string): string {
  return h.length > 10 ? `${h.slice(0, 10)}…` : h;
}
