import { HarnessLog } from "./types.js";

export {
  HarnessLog,
  HarnessLogSink,
  type HarnessLogCategory,
  type HarnessLogClass,
  type HarnessLogContext,
  type HarnessLogError,
  type HarnessLogLevel,
  type HarnessLoggingConfig,
  type HarnessLoggingLevel,
  type HarnessLogRecord,
  type HarnessLogSource,
  type HarnessLogSourceKind,
  type HarnessRedactionConfig,
} from "./types.js";
export {
  defaultRedactKeys,
  redactError,
  redactValue,
  shouldRedactKey,
  summarizeValue,
} from "./redaction.js";
export { normalizeHarnessLog } from "./normalize.js";
export {
  ConsoleLogSink,
  MemoryLogSink,
  shouldWriteLog,
  type ConsoleLogSinkOptions,
  type MemoryLogSinkOptions,
} from "./sinks.js";

export class AgentDebugLog extends HarnessLog<{ message: string }> {
  level = "debug" as const;
  category = "agent" as const;
  message(fields: { message: string }): string {
    return fields.message;
  }
}

export class AgentInfoLog extends HarnessLog<{ message: string }> {
  level = "info" as const;
  category = "agent" as const;
  message(fields: { message: string }): string {
    return fields.message;
  }
}

export class AgentWarnLog extends HarnessLog<{ message: string }> {
  level = "warn" as const;
  category = "agent" as const;
  message(fields: { message: string }): string {
    return fields.message;
  }
}

export class AgentErrorLog extends HarnessLog<{ message: string; error?: unknown }> {
  level = "error" as const;
  category = "agent" as const;
  message(fields: { message: string }): string {
    return fields.message;
  }
}
