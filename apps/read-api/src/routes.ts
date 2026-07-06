// Request helpers: tenant scoping + date range. In production the org comes from
// an authenticated token; here we accept X-Org-Id header (or ?org= for the demo)
// — the single seam where real RBAC/auth plugs in.
import type { DateRange } from "@heliograph/storage";

export function orgFrom(req: Request): string | null {
  const url = new URL(req.url);
  return req.headers.get("x-org-id") || url.searchParams.get("org");
}

export function dateRange(req: Request, org: string): DateRange {
  const url = new URL(req.url);
  return {
    org,
    from: url.searchParams.get("from") || daysAgo(30),
    to: url.searchParams.get("to") || ymd(new Date()),
  };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  return ymd(new Date(Date.now() - n * 86_400_000));
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
