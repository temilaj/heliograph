/**
 * Shared ops HTTP surface: /healthz (liveness), /readyz (readiness), /metrics
 */
export interface HealthState {
  live: () => boolean;
  ready: () => boolean | Promise<boolean>;
}

export function handleOpsRequest(
  req: Request,
  state: HealthState,
): Response | Promise<Response> | null {
  const url = new URL(req.url);
  switch (url.pathname) {
    case "/healthz":
      return json(state.live() ? 200 : 503, { status: state.live() ? "ok" : "down" });
    case "/readyz":
      return Promise.resolve(state.ready()).then((r) =>
        json(r ? 200 : 503, { status: r ? "ready" : "not-ready" }),
      );
    case "/metrics":
      // Placeholder:
      return new Response("# heliograph metrics placeholder\n", {
        status: 200,
        headers: { "content-type": "text/plain; version=0.0.4" },
      });
    default:
      return null;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
