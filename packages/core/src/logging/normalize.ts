import { randomId } from "../runtime/id.js";
import type {
  HarnessLogClass,
  HarnessLogContext,
  HarnessLogRecord,
  HarnessRedactionConfig,
} from "./types.js";
import { redactError, redactValue } from "./redaction.js";

function nowIso(): string {
  return new Date().toISOString();
}

function plainObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Error) return undefined;
  return value as Record<string, unknown>;
}

export function normalizeHarnessLog<TFields>(
  logClass: HarnessLogClass<TFields>,
  fields: TFields,
  context: HarnessLogContext = {},
  redaction: HarnessRedactionConfig = {},
): HarnessLogRecord {
  const log = new logClass();
  const originalFields = log.redact ? log.redact(fields) : fields;
  const originalError = originalFields instanceof Error
    ? originalFields
    : originalFields && typeof originalFields === "object" && "error" in originalFields && (originalFields as { error?: unknown }).error instanceof Error
      ? (originalFields as { error: Error }).error
      : undefined;
  const redactedFields = redactValue(originalFields, redaction) as TFields;
  const fieldsObject = plainObject(redactedFields);
  return {
    id: randomId(),
    at: nowIso(),
    level: log.levelFor?.(redactedFields) ?? log.level,
    category: log.category,
    type: logClass.name,
    message: log.message(redactedFields),
    sessionId: context.sessionId,
    runId: context.runId,
    turnId: context.turnId,
    modeId: context.modeId,
    branchId: context.branchId,
    source: context.source ?? { kind: "runtime" },
    correlationId: context.correlationId,
    causationId: context.causationId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    durationMs: context.durationMs,
    fields: fieldsObject,
    error: originalError ? redactError(originalError) : undefined,
  };
}
