import { randomId } from "../runtime/id.js";
import type { ToolApprovalRequest } from "../runtime/types.js";
import type { ToolApprovalHandle } from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export interface PendingToolApproval {
  handle: ToolApprovalHandle;
  resolve(approved: boolean): void;
  timeout?: NodeJS.Timeout;
}

export function createToolApprovalHandle(input: {
  sessionId: string;
  runId: string;
  request: ToolApprovalRequest;
  timeoutMs: number;
  approve(id: string): Promise<void>;
  deny(id: string, reason?: string): Promise<void>;
}): ToolApprovalHandle {
  const createdAt = nowIso();
  const expiresAt = input.timeoutMs > 0 ? new Date(Date.now() + input.timeoutMs).toISOString() : undefined;
  const id = randomId();
  return {
    id,
    sessionId: input.sessionId,
    runId: input.runId,
    toolCallId: input.request.id,
    name: input.request.name,
    args: input.request.args,
    modeId: input.request.modeId,
    risk: input.request.risk,
    permissions: input.request.permissions,
    createdAt,
    expiresAt,
    approve: () => input.approve(id),
    deny: (reason?: string) => input.deny(id, reason),
  };
}
