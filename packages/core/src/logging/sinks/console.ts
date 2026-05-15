import { HarnessLogSink, type HarnessLogRecord, type HarnessLoggingLevel } from "../types.js";
import { consoleMethod, formatValue, shouldWriteLog } from "./shared.js";

export interface ConsoleLogSinkOptions {
  format?: "pretty" | "json";
  level?: HarnessLoggingLevel;
  console?: Pick<Console, "log" | "warn" | "error">;
}

export class ConsoleLogSink extends HarnessLogSink {
  private readonly format: "pretty" | "json";
  private readonly level?: HarnessLoggingLevel;
  private readonly target: Pick<Console, "log" | "warn" | "error">;

  constructor(options: ConsoleLogSinkOptions = {}) {
    super();
    this.format = options.format ?? "pretty";
    this.level = options.level;
    this.target = options.console ?? console;
  }

  write(record: HarnessLogRecord): void {
    if (this.level && !shouldWriteLog(record.level, this.level)) return;
    const method = consoleMethod(record.level);
    if (this.format === "json") {
      this.target[method](JSON.stringify(record));
      return;
    }
    const fields = Object.entries(record.fields ?? {})
      .map(([key, value]) => `${key}=${formatValue(value)}`)
      .join(" ");
    const context = [
      record.sessionId ? `session=${record.sessionId}` : undefined,
      record.runId ? `run=${record.runId}` : undefined,
      record.durationMs !== undefined ? `durationMs=${record.durationMs}` : undefined,
    ].filter(Boolean).join(" ");
    const suffix = [fields, context].filter(Boolean).join(" ");
    this.target[method](`[${record.level}] ${record.message}${suffix ? ` ${suffix}` : ""}`);
  }
}
