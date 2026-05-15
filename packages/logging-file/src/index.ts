import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { HarnessLogSink, shouldWriteLog, type HarnessLogRecord, type HarnessLoggingLevel } from "@harness-kernel/core/runner/logging";

export interface JsonlFileLogSinkOptions {
  path: string;
  level?: HarnessLoggingLevel;
}

export class JsonlFileLogSink extends HarnessLogSink {
  private pending: Promise<void>;
  private readonly level?: HarnessLoggingLevel;

  constructor(private readonly options: JsonlFileLogSinkOptions) {
    super();
    this.level = options.level;
    this.pending = mkdir(dirname(options.path), { recursive: true }).then(() => undefined);
  }

  write(record: HarnessLogRecord): Promise<void> {
    if (this.level && !shouldWriteLog(record.level, this.level)) return Promise.resolve();
    const write = this.pending.then(() => appendFile(this.options.path, `${JSON.stringify(record)}\n`, "utf8"));
    this.pending = write.catch(() => undefined);
    return write;
  }

  async flush(): Promise<void> {
    await this.pending;
  }

  async close(): Promise<void> {
    await this.flush();
  }
}
