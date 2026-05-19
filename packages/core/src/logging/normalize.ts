import { randomId } from "../runtime/id.js";
import type {
  HarnessLogClass,
  HarnessLogContext,
  HarnessLogRecord,
  HarnessRedactionConfig,
} from "./types.js";
import { redactError, redactValue } from "./redaction.js";
import { isHarnessErrorShape } from "../runtime/errors.js";
import type { HarnessErrorShape } from "../runtime/types/errors.js";

function nowIso(): string {
  return new Date().toISOString();
}

function plainObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Error) return undefined;
  return value as Record<string, unknown>;
}

function logErrorFromFields(value: unknown): Error | HarnessErrorShape | undefined {
  if (value instanceof Error || isHarnessErrorShape(value)) return value;
  if (value && typeof value === "object" && "error" in value) {
    const candidate = (value as { error?: unknown }).error;
    if (candidate instanceof Error || isHarnessErrorShape(candidate)) return candidate;
  }
  return undefined;
}

export function normalizeHarnessLog<TFields>(
  logClass: HarnessLogClass<TFields>,
  fields: TFields,
  context: HarnessLogContext = {},
  redaction: HarnessRedactionConfig = {},
): HarnessLogRecord {
  const log = new logClass();
  const originalFields = log.redact ? log.redact(fields) : fields;
  const originalError = logErrorFromFields(originalFields);
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
