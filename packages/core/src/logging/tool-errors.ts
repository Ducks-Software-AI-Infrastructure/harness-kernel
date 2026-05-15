export type ToolErrorCode =
  | "tool.args.invalid_schema"
  | "tool.approval.denied"
  | "sandbox.exec.failed"
  | "tool.failed";

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
