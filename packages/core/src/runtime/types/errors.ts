import type { HarnessEventSource } from "./events.js";

export type HarnessErrorCategory =
  | "run"
  | "model"
  | "tool"
  | "context"
  | "storage"
  | "sandbox"
  | "approval"
  | "runtime";

export type HarnessErrorSeverity = "warn" | "error" | "fatal";

export type HarnessErrorCode =
  | "run.failed"
  | "run.aborted"
  | "model.failed"
  | "model.rate_limited"
  | "model.timeout"
  | "tool.failed"
  | "tool.args.invalid_schema"
  | "tool.approval.denied"
  | "context.provider.failed"
  | "storage.write_failed"
  | "sandbox.exec.failed"
  | "runtime.failed";

export interface HarnessErrorShape {
  code: HarnessErrorCode;
  message: string;
  publicMessage?: string;
  category: HarnessErrorCategory;
  severity: HarnessErrorSeverity;
  recoverable: boolean;
  source?: HarnessEventSource;
  name?: string;
  stack?: string;
  cause?: unknown;
  details?: unknown;
}

export interface HarnessRetryPolicy {
  attempts?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
}

export interface HarnessErrorPolicy {
  exposeInternalErrors?: boolean;
  includeStackInStatus?: boolean;
  closeSessionOnFatal?: boolean;
  contextFailure?: "fail" | "warn-and-skip";
  retry?: {
    model?: HarnessRetryPolicy;
    storage?: HarnessRetryPolicy;
  };
  classify?(
    error: unknown,
    context: HarnessErrorContext,
  ): Partial<HarnessErrorShape> | undefined;
}

export interface HarnessErrorContext {
  code?: HarnessErrorCode;
  category?: HarnessErrorCategory;
  severity?: HarnessErrorSeverity;
  recoverable?: boolean;
  source?: HarnessEventSource;
  message?: string;
  publicMessage?: string;
  details?: unknown;
}
