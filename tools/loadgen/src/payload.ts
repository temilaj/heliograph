// Builds a realistic Claude Code OTLP/JSON metrics ExportMetricsServiceRequest.
// Includes an embedded email + account uuid to prove they are hashed, never stored raw.

export interface GenOptions {
  orgId?: string;
  sessionId?: string;
  email?: string;
  accountUuid?: string;
  timeUnixNano?: string; // pass a fixed value for determinism
}

const kv = (key: string, value: string) => ({ key, value: { stringValue: value } });
const intPoint = (attrs: object[], value: number, timeUnixNano: string) => ({
  attributes: attrs,
  timeUnixNano,
  asInt: String(value),
});

export function claudeCodeMetricsPayload(opts: GenOptions = {}): unknown {
  const t = opts.timeUnixNano ?? "1751812607000000000";
  const model = "claude-opus-4-8";
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            kv("service.name", "claude-code"),
            kv("organization.id", opts.orgId ?? "org_acme"),
            kv("session.id", opts.sessionId ?? "sess_123"),
            kv("user.id", "install_abc"),
            kv("user.account_uuid", opts.accountUuid ?? "acct-uuid-999"),
            kv("user.email", opts.email ?? "jane.doe@acme.com"),
            kv("app.version", "1.42.0"),
            kv("app.entrypoint", "cli"),
            kv("terminal.type", "iTerm"),
            kv("department", "platform"),
            kv("team.id", "heliograph"),
          ],
        },
        scopeMetrics: [
          {
            scope: { name: "com.anthropic.claude_code", version: "1.42.0" },
            metrics: [
              {
                name: "claude_code.session.count",
                unit: "count",
                sum: { isMonotonic: true, dataPoints: [intPoint([kv("model", model)], 1, t)] },
              },
              {
                name: "claude_code.token.usage",
                unit: "token",
                sum: {
                  isMonotonic: true,
                  dataPoints: [
                    intPoint([kv("model", model), kv("type", "input")], 1200, t),
                    intPoint([kv("model", model), kv("type", "output")], 340, t),
                    intPoint([kv("model", model), kv("type", "cacheRead")], 8000, t),
                  ],
                },
              },
              {
                name: "claude_code.cost.usage",
                unit: "USD",
                sum: {
                  isMonotonic: true,
                  dataPoints: [
                    {
                      attributes: [kv("model", model)],
                      timeUnixNano: t,
                      asDouble: 0.0123,
                    },
                  ],
                },
              },
              {
                name: "claude_code.lines_of_code.count",
                unit: "count",
                sum: {
                  isMonotonic: true,
                  dataPoints: [
                    intPoint([kv("language", "typescript"), kv("edit_type", "add")], 42, t),
                    intPoint([kv("language", "typescript"), kv("edit_type", "remove")], 7, t),
                  ],
                },
              },
              {
                name: "claude_code.code_edit_tool.decision",
                unit: "count",
                sum: {
                  isMonotonic: true,
                  dataPoints: [
                    intPoint(
                      [kv("tool_name", "Edit"), kv("decision", "accept"), kv("language", "typescript")],
                      1,
                      t,
                    ),
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}
