import type {
  HarnessErrorCategory,
  HarnessErrorCode,
  HarnessErrorContext,
  HarnessErrorPolicy,
  HarnessErrorSeverity,
  HarnessErrorShape,
} from "./types/errors.js";

const harnessErrorProperty = "__harnessError";

const codeDefaults: Record<HarnessErrorCode, {
  category: HarnessErrorCategory;
  severity: HarnessErrorSeverity;
  recoverable: boolean;
  publicMessage: string;
}> = {
  "run.failed": {
    category: "run",
    severity: "fatal",
    recoverable: false,
    publicMessage: "Run failed.",
  },
  "run.aborted": {
    category: "run",
    severity: "warn",
    recoverable: false,
    publicMessage: "Run aborted.",
  },
  "model.failed": {
    category: "model",
    severity: "error",
    recoverable: false,
    publicMessage: "Model provider failed.",
  },
  "model.rate_limited": {
    category: "model",
    severity: "warn",
    recoverable: false,
    publicMessage: "Model provider was rate limited.",
  },
  "model.timeout": {
    category: "model",
    severity: "warn",
    recoverable: false,
    publicMessage: "Model provider timed out.",
  },
  "tool.failed": {
    category: "tool",
    severity: "error",
    recoverable: true,
    publicMessage: "Tool execution failed.",
  },
  "tool.args.invalid_schema": {
    category: "tool",
    severity: "error",
    recoverable: true,
    publicMessage: "Tool arguments did not match schema.",
  },
  "tool.approval.denied": {
    category: "approval",
    severity: "warn",
    recoverable: true,
    publicMessage: "Tool approval was denied.",
  },
  "context.provider.failed": {
    category: "context",
    severity: "error",
    recoverable: false,
    publicMessage: "Context provider failed.",
  },
  "storage.write_failed": {
    category: "storage",
    severity: "error",
    recoverable: true,
    publicMessage: "Storage write failed.",
  },
  "sandbox.exec.failed": {
    category: "sandbox",
    severity: "error",
    recoverable: true,
    publicMessage: "Sandbox execution failed.",
  },
  "runtime.failed": {
    category: "runtime",
    severity: "fatal",
    recoverable: false,
    publicMessage: "Runtime failed.",
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value as Record<string, unknown> : undefined;
}

function stringField(value: unknown, field: string): string | undefined {
  const record = asRecord(value);
  return typeof record?.[field] === "string" ? record[field] : undefined;
}

function numberField(value: unknown, field: string): number | undefined {
  const record = asRecord(value);
  return typeof record?.[field] === "number" ? record[field] : undefined;
}

function errorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  return String(error ?? fallback);
}

function errorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : stringField(error, "name");
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : stringField(error, "stack");
}

function errorCause(error: unknown): unknown {
  if (error instanceof Error && "cause" in error) return error.cause;
  return asRecord(error)?.cause;
}

function attachedHarnessError(error: unknown): HarnessErrorShape | undefined {
  const attached = asRecord(error)?.[harnessErrorProperty];
  return isHarnessErrorShape(attached) ? attached : undefined;
}

function isAbortError(error: unknown): boolean {
  const name = errorName(error)?.toLowerCase();
  const message = errorMessage(error, "").toLowerCase();
  const code = stringField(error, "code")?.toLowerCase();
  return name === "aborterror"
    || code === "abort_err"
    || message === "run aborted."
    || message.includes("aborted")
    || message.includes("cancelled")
    || message.includes("canceled");
}

function modelErrorCode(error: unknown): HarnessErrorCode {
  const status = numberField(error, "status") ?? numberField(error, "statusCode");
  const code = stringField(error, "code")?.toLowerCase() ?? "";
  const name = errorName(error)?.toLowerCase() ?? "";
  const message = errorMessage(error, "").toLowerCase();

  if (status === 429 || code.includes("rate") || message.includes("rate limit") || message.includes("too many requests")) {
    return "model.rate_limited";
  }
  if (
    code.includes("timeout")
    || code === "etimedout"
    || name.includes("timeout")
    || message.includes("timed out")
    || message.includes("timeout")
  ) {
    return "model.timeout";
  }
  return "model.failed";
}

function defaultCode(error: unknown, context: HarnessErrorContext): HarnessErrorCode {
  if (isAbortError(error)) return "run.aborted";
  if (context.code) return context.code;
  if (context.category === "model" || context.source?.kind === "model_provider") return modelErrorCode(error);
  if (context.category === "tool" || context.source?.kind === "tool") return "tool.failed";
  if (context.category === "context" || context.source?.kind === "context_provider") return "context.provider.failed";
  if (context.category === "storage") return "storage.write_failed";
  if (context.category === "sandbox") return "sandbox.exec.failed";
  if (context.category === "run") return "run.failed";
  return "runtime.failed";
}

function isHarnessErrorCode(value: unknown): value is HarnessErrorCode {
  return typeof value === "string" && value in codeDefaults;
}

function applyDefaults(shape: Partial<HarnessErrorShape> & { message: string }, context: HarnessErrorContext): HarnessErrorShape {
  const code = isHarnessErrorCode(shape.code) ? shape.code : defaultCode(undefined, context);
  const defaults = codeDefaults[code];
  const contextMatchesCode = context.code === undefined || context.code === code;
  return {
    code,
    message: shape.message,
    publicMessage: shape.publicMessage ?? context.publicMessage ?? defaults.publicMessage,
    category: shape.category ?? (contextMatchesCode ? context.category : undefined) ?? defaults.category,
    severity: shape.severity ?? (contextMatchesCode ? context.severity : undefined) ?? defaults.severity,
    recoverable: shape.recoverable ?? (contextMatchesCode ? context.recoverable : undefined) ?? defaults.recoverable,
    source: shape.source ?? context.source,
    name: shape.name,
    stack: shape.stack,
    cause: shape.cause,
    details: shape.details ?? context.details,
  };
}

export function isHarnessErrorShape(value: unknown): value is HarnessErrorShape {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HarnessErrorShape>;
  return isHarnessErrorCode(candidate.code)
    && typeof candidate.message === "string"
    && typeof candidate.category === "string"
    && typeof candidate.severity === "string"
    && typeof candidate.recoverable === "boolean";
}

export function annotateHarnessError(error: unknown, shape: HarnessErrorShape): void {
  if (!isObject(error)) return;
  try {
    Object.defineProperty(error, harnessErrorProperty, {
      value: shape,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // Annotation is best-effort and must never replace the original failure.
  }
}

export function normalizeHarnessError(
  error: unknown,
  context: HarnessErrorContext = {},
  policy: HarnessErrorPolicy = {},
): HarnessErrorShape {
  const existing = isHarnessErrorShape(error) ? error : attachedHarnessError(error);
  const inferredCode = existing?.code ?? defaultCode(error, context);
  const defaults = codeDefaults[inferredCode];
  const base = existing
    ? applyDefaults({
      ...existing,
      message: existing.message || context.message || defaults.publicMessage,
    }, context)
    : applyDefaults({
      code: inferredCode,
      message: context.message ?? errorMessage(error, defaults.publicMessage),
      publicMessage: context.publicMessage,
      source: context.source,
      name: errorName(error),
      stack: errorStack(error),
      cause: errorCause(error),
      details: context.details,
    }, context);

  const classified = policy.classify?.(error, context) ?? {};
  const merged: Partial<HarnessErrorShape> & { message: string } = {
    ...base,
    ...classified,
    message: classified.message ?? base.message,
  };
  if (classified.code && classified.category === undefined) merged.category = undefined;
  if (classified.code && classified.severity === undefined) merged.severity = undefined;
  if (classified.code && classified.recoverable === undefined) merged.recoverable = undefined;
  if (classified.code && classified.publicMessage === undefined) merged.publicMessage = undefined;
  return applyDefaults(merged, context);
}

export function sanitizeHarnessError(
  error: HarnessErrorShape,
  policy: HarnessErrorPolicy = {},
): HarnessErrorShape {
  const expose = policy.exposeInternalErrors === true;
  const includeStack = expose || policy.includeStackInStatus === true;
  return {
    code: error.code,
    message: expose ? error.message : error.publicMessage ?? error.message,
    publicMessage: error.publicMessage,
    category: error.category,
    severity: error.severity,
    recoverable: error.recoverable,
    source: error.source,
    name: error.name,
    stack: includeStack ? error.stack : undefined,
    cause: expose ? error.cause : undefined,
    details: expose ? error.details : undefined,
  };
}
