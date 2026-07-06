/**
 * Minimal structured JSON logger. 
 * seam is here to swap in pino/OpenTelemetry logs later
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  service: string;
  level?: LogLevel;
  bindings?: Record<string, unknown>;
}

export function createLogger(opts: LoggerOptions): Logger {
  const minLevel = LEVEL_ORDER[opts.level ?? "info"];
  const base = { service: opts.service, ...opts.bindings };

  function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] < minLevel) return;
    const line = JSON.stringify({
      level,
      msg,
      time: new Date().toISOString(),
      ...base,
      ...fields,
    });
    if (level === "error" || level === "warn") process.stderr.write(line + "\n");
    else process.stdout.write(line + "\n");
  }

  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (bindings) =>
      createLogger({
        service: opts.service,
        level: opts.level,
        bindings: { ...opts.bindings, ...bindings },
      }),
  };
}
