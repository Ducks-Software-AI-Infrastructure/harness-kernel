import type { AgentToolResult } from "../runtime/types/tools.js";
import type { HarnessErrorCode } from "../runtime/types/errors.js";

export type ToolErrorCode =
  Extract<HarnessErrorCode,
    | "tool.args.invalid_schema"
    | "tool.approval.denied"
    | "sandbox.exec.failed"
    | "tool.failed">;

export interface ToolInvalidField {
  path: string;
  code?: string;
  expected?: string;
  received?: string;
  message: string;
}

export interface ToolErrorPayload {
  ok: false;
  error: {
    code: ToolErrorCode;
    message: string;
    toolName: string;
    invalidFields?: ToolInvalidField[];
    metadata?: Record<string, unknown>;
  };
}

export function createToolErrorPayload(input: {
  code: ToolErrorCode;
  message: string;
  toolName: string;
  invalidFields?: ToolInvalidField[];
  metadata?: Record<string, unknown>;
}): ToolErrorPayload {
  return {
    ok: false,
    error: {
      code: input.code,
      message: input.message,
      toolName: input.toolName,
      invalidFields: input.invalidFields,
      metadata: input.metadata,
    },
  };
}

export function createToolErrorResult(input: {
  code: ToolErrorCode;
  message: string;
  toolName: string;
  content?: string;
  invalidFields?: ToolInvalidField[];
  metadata?: Record<string, unknown>;
}): AgentToolResult<ToolErrorPayload> {
  return {
    content: input.content ?? input.message,
    data: createToolErrorPayload({
      code: input.code,
      message: input.message,
      toolName: input.toolName,
      invalidFields: input.invalidFields,
      metadata: input.metadata,
    }),
    isError: true,
    metadata: {
      errorCode: input.code,
      ...(input.invalidFields ? { invalidFields: input.invalidFields } : {}),
      ...(input.metadata ?? {}),
    },
  };
}
