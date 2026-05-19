import type {
  HarnessErrorCategory,
  HarnessErrorCode,
  HarnessErrorSeverity,
} from "../runtime/types/errors.js";

export type HarnessLogLevel = "debug" | "info" | "warn" | "error";
export type HarnessLoggingLevel = "silent" | HarnessLogLevel;

export type HarnessLogCategory =
  | "session"
  | "run"
  | "turn"
  | "context"
  | "model"
  | "tool"
  | "approval"
  | "snapshot"
  | "transcript"
  | "storage"
  | "agent";

export type HarnessLogSourceKind =
  | "runtime"
  | "model_provider"
  | "tool"
  | "hook"
  | "context_provider"
  | "mode"
  | "user"
  | "custom";

export interface HarnessLogSource {
  kind: HarnessLogSourceKind;
  id?: string;
  type?: string;
  name?: string;
  label?: string;
}

export interface HarnessLogError {
  code?: HarnessErrorCode;
  category?: HarnessErrorCategory;
  severity?: HarnessErrorSeverity;
  recoverable?: boolean;
  name?: string;
  message: string;
  stack?: string;
}

export interface HarnessLogRecord {
  id: string;
  at: string;
  level: HarnessLogLevel;
  category: HarnessLogCategory;
  type: string;
  message: string;
  sessionId?: string;
  runId?: string;
  turnId?: string;
  modeId?: string;
  branchId?: string;
  source: HarnessLogSource;
  correlationId?: string;
  causationId?: string;
  spanId?: string;
  parentSpanId?: string;
  durationMs?: number;
  fields?: Record<string, unknown>;
  error?: HarnessLogError;
}

export abstract class HarnessLog<TFields = Record<string, unknown>> {
  abstract level: HarnessLogLevel;
  abstract category: HarnessLogCategory;
  abstract message(fields: TFields): string;
  levelFor?(fields: TFields): HarnessLogLevel;
  redact?(fields: TFields): TFields;
}

export type HarnessLogClass<TFields = Record<string, unknown>> = new () => HarnessLog<TFields>;

export abstract class HarnessLogSink {
  abstract write(record: HarnessLogRecord): void | Promise<void>;
  flush?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

export interface HarnessLoggingConfig {
  level?: HarnessLoggingLevel;
  sinks?: HarnessLogSink[];
  format?: "pretty" | "json";
  modelDeltas?: "none" | "summary" | "full" | boolean;
  events?: boolean;
  redact?: {
    keys?: string[];
    replacement?: string;
  };
}

export interface HarnessRedactionConfig {
  keys?: string[];
  replacement?: string;
}

export interface HarnessLogContext {
  sessionId?: string;
  runId?: string;
  turnId?: string;
  modeId?: string;
  branchId?: string;
  source?: HarnessLogSource;
  correlationId?: string;
  causationId?: string;
  spanId?: string;
  parentSpanId?: string;
  durationMs?: number;
}
