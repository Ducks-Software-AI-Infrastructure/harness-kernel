import type { HarnessLogLevel, HarnessLoggingLevel } from "../types.js";

const levelOrder: Record<HarnessLoggingLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export function shouldWriteLog(recordLevel: HarnessLogLevel, configuredLevel: HarnessLoggingLevel | undefined): boolean {
  const level = configuredLevel ?? "silent";
  return level !== "silent" && levelOrder[recordLevel] <= levelOrder[level];
}

export function consoleMethod(level: HarnessLogLevel): "error" | "warn" | "log" {
  if (level === "error") return "error";
  if (level === "warn") return "warn";
  return "log";
}

export function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return String(value);
  return JSON.stringify(value);
}
