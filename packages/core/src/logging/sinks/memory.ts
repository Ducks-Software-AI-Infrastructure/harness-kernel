import { HarnessLogSink, type HarnessLogRecord, type HarnessLoggingLevel } from "../types.js";
import { shouldWriteLog } from "./shared.js";

export interface MemoryLogSinkOptions {
  level?: HarnessLoggingLevel;
}

export class MemoryLogSink extends HarnessLogSink {
  readonly records: HarnessLogRecord[] = [];
  private readonly level?: HarnessLoggingLevel;

  constructor(options: MemoryLogSinkOptions = {}) {
    super();
    this.level = options.level;
  }

  write(record: HarnessLogRecord): void {
    if (this.level && !shouldWriteLog(record.level, this.level)) return;
    this.records.push(record);
  }

  clear(): void {
    this.records.length = 0;
  }
}
