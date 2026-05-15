import {
  AgentDebugLog,
  AgentErrorLog,
  AgentInfoLog,
  AgentWarnLog,
} from "./index.js";
import { ConsoleLogSink, normalizeHarnessLog, shouldWriteLog } from "./index.js";
import type {
  HarnessLogClass,
  HarnessLogContext,
  HarnessLoggingConfig,
  HarnessLogSink,
} from "./index.js";
import type { AgentLogSession } from "../runtime/types.js";

export interface HarnessLogger {
  readonly modelDeltas: "none" | "summary" | "full";
  emit<TFields>(logClass: HarnessLogClass<TFields>, fields: TFields, context?: HarnessLogContext): void;
  debug(message: string, fields?: Record<string, unknown>, context?: HarnessLogContext): void;
  info(message: string, fields?: Record<string, unknown>, context?: HarnessLogContext): void;
  warn(message: string, fields?: Record<string, unknown>, context?: HarnessLogContext): void;
  error(errorOrMessage: unknown, fields?: Record<string, unknown>, context?: HarnessLogContext): void;
  agent(context: HarnessLogContext): AgentLogSession;
  flush(): Promise<void>;
  close(): Promise<void>;
}

function normalizeModelDeltas(value: HarnessLoggingConfig["modelDeltas"]): "none" | "summary" | "full" {
  if (value === true) return "full";
  if (value === false || value === undefined) return "none";
  return value;
}

function configuredSinks(config: HarnessLoggingConfig): HarnessLogSink[] {
  if (config.sinks?.length) return config.sinks;
  if (config.level && config.level !== "silent") {
    return [new ConsoleLogSink({ format: config.format ?? "pretty" })];
  }
  return [];
}

function messageFromUnknown(errorOrMessage: unknown): string {
  if (errorOrMessage instanceof Error) return errorOrMessage.message;
  return String(errorOrMessage);
}

function payload(message: string, fields?: Record<string, unknown>, error?: unknown): Record<string, unknown> {
  return {
    ...(fields ?? {}),
    message,
    ...(error === undefined ? {} : { error }),
  };
}

export function createHarnessLogger(config: HarnessLoggingConfig = {}): HarnessLogger {
  const level = config.level ?? "silent";
  const sinks = configuredSinks(config);
  const modelDeltas = normalizeModelDeltas(config.modelDeltas);

  const emit = <TFields>(logClass: HarnessLogClass<TFields>, fields: TFields, context: HarnessLogContext = {}) => {
    const record = normalizeHarnessLog(logClass, fields, context, config.redact);
    if (!shouldWriteLog(record.level, level)) return;
    for (const sink of sinks) {
      try {
        void Promise.resolve(sink.write(record)).catch(() => undefined);
      } catch {
        // Logging must not affect agent execution.
      }
    }
  };

  const logger: HarnessLogger = {
    modelDeltas,
    emit,
    debug(message, fields, context) {
      emit(AgentDebugLog, payload(message, fields) as { message: string }, context);
    },
    info(message, fields, context) {
      emit(AgentInfoLog, payload(message, fields) as { message: string }, context);
    },
    warn(message, fields, context) {
      emit(AgentWarnLog, payload(message, fields) as { message: string }, context);
    },
    error(errorOrMessage, fields, context) {
      emit(AgentErrorLog, payload(messageFromUnknown(errorOrMessage), fields, errorOrMessage), context);
    },
    agent(context) {
      return {
        debug: (message, fields) => logger.debug(message, fields, context),
        info: (message, fields) => logger.info(message, fields, context),
        warn: (message, fields) => logger.warn(message, fields, context),
        error: (errorOrMessage, fields) => logger.error(errorOrMessage, fields, context),
        emit: (logClass, fields) => logger.emit(logClass, fields, context),
      };
    },
    async flush() {
      await Promise.all(sinks.map(async (sink) => {
        try {
          await sink.flush?.();
        } catch {
          // Ignore sink failures.
        }
      }));
    },
    async close() {
      await Promise.all(sinks.map(async (sink) => {
        try {
          await sink.close?.();
        } catch {
          // Ignore sink failures.
        }
      }));
    },
  };

  return logger;
}
