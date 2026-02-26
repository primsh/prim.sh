import { getRequestId } from "./request-id.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined;
  if (env && env in LEVEL_ORDER) return env;
  return process.env.NODE_ENV === "development" ? "debug" : "info";
}

export interface Logger {
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  debug(msg: string, extra?: Record<string, unknown>): void;
  child(extra: Record<string, unknown>): Logger;
}

function emit(
  level: LogLevel,
  service: string,
  msg: string,
  baseExtra: Record<string, unknown>,
  extra?: Record<string, unknown>,
): void {
  const minLevel = getMinLevel();
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const requestId = getRequestId();
  const line = JSON.stringify({
    level,
    service,
    msg,
    request_id: requestId ?? null,
    ts: new Date().toISOString(),
    ...baseExtra,
    ...extra,
  });

  process.stdout.write(`${line}\n`);
}

export function createLogger(service: string, baseExtra: Record<string, unknown> = {}): Logger {
  return {
    debug(msg: string, extra?: Record<string, unknown>) {
      emit("debug", service, msg, baseExtra, extra);
    },
    info(msg: string, extra?: Record<string, unknown>) {
      emit("info", service, msg, baseExtra, extra);
    },
    warn(msg: string, extra?: Record<string, unknown>) {
      emit("warn", service, msg, baseExtra, extra);
    },
    error(msg: string, extra?: Record<string, unknown>) {
      emit("error", service, msg, baseExtra, extra);
    },
    child(extra: Record<string, unknown>): Logger {
      return createLogger(service, { ...baseExtra, ...extra });
    },
  };
}
