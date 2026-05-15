import type { ToolApprovalDecision, ToolApprovalRequest } from "../runtime/types.js";
import { createToolApprovalHandle, type PendingToolApproval } from "./approvals.js";
import type { ToolApprovalHandle } from "./types.js";

export class ApprovalController {
  private readonly pendingApprovals = new Map<string, PendingToolApproval>();
  private readonly approvalIdsByToolCallId = new Map<string, string>();

  constructor(
    private readonly input: {
      sessionId: string;
      getRunId(): string;
      timeoutMs: number;
      notifyRequested(handle: ToolApprovalHandle): void;
    },
  ) {}

  get count(): number {
    return this.pendingApprovals.size;
  }

  getPending(): ToolApprovalHandle[] {
    return [...this.pendingApprovals.values()].map((approval) => approval.handle);
  }

  hydrateApprovalId(toolCallId: string): string {
    const approvalId = this.approvalIdsByToolCallId.get(toolCallId) ?? toolCallId;
    this.approvalIdsByToolCallId.delete(toolCallId);
    return approvalId;
  }

  request(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    return new Promise((resolve) => {
      const handle = createToolApprovalHandle({
        sessionId: this.input.sessionId,
        runId: this.input.getRunId(),
        request,
        timeoutMs: this.input.timeoutMs,
        approve: async (id) => this.resolve(id, true),
        deny: async (id, reason) => this.resolve(id, false, reason),
      });
      const timeout = setTimeout(() => {
        this.resolve(handle.id, false);
      }, this.input.timeoutMs);

      this.pendingApprovals.set(handle.id, {
        handle,
        timeout,
        resolve: (approved) => resolve(approved ? "approved" : "denied"),
      });
      this.approvalIdsByToolCallId.set(handle.toolCallId, handle.id);
      this.input.notifyRequested(handle);
    });
  }

  resolve(approvalId: string, approved: boolean, _reason?: string): void {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) throw new Error(`Tool approval '${approvalId}' was not found.`);
    if (pending.timeout) clearTimeout(pending.timeout);
    this.pendingApprovals.delete(approvalId);
    pending.resolve(approved);
  }

  denyAll(): void {
    for (const approval of [...this.pendingApprovals.values()]) {
      this.resolve(approval.handle.id, false);
    }
  }
}
