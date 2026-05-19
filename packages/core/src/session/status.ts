import {
  ContextReadyEvent,
  ErrorEvent,
  ModelBeforeEvent,
  RunAbortedEvent,
  RunEndEvent,
  RunFailedEvent,
  RunStartEvent,
  ToolApprovalRequestedEvent,
  ToolApprovalResolvedEvent,
  ToolEndEvent,
  ToolStartEvent,
  TurnEndEvent,
} from "../runtime/events.js";
import type { HarnessEventRecord } from "../runtime/types.js";
import { HarnessSessionPhase, type HarnessErrorShape } from "./types.js";

function payloadObject(record: HarnessEventRecord): Record<string, unknown> {
  return record.payload && typeof record.payload === "object" ? record.payload as Record<string, unknown> : {};
}

export interface SessionStatusSnapshot {
  running: boolean;
  phase: HarnessSessionPhase;
  queuedInputCount: number;
  currentTurnId?: string;
  activeTool?: { id: string; name: string };
  lastEventAt?: string;
  lastError?: HarnessErrorShape;
}

export class SessionStatusTracker {
  private runningValue = false;
  private closedValue = false;
  private phaseValue = HarnessSessionPhase.Idle;
  private queuedInputCountValue = 0;
  private currentTurnIdValue: string | undefined;
  private activeToolValue: { id: string; name: string } | undefined;
  private lastEventAtValue: string | undefined;
  private lastErrorValue: HarnessErrorShape | undefined;

  get running(): boolean {
    return this.runningValue;
  }

  get queuedInputCount(): number {
    return this.queuedInputCountValue;
  }

  get activeTool(): { id: string; name: string } | undefined {
    return this.activeToolValue;
  }

  get phase(): HarnessSessionPhase {
    return this.closedValue ? HarnessSessionPhase.Closed : this.phaseValue;
  }

  enqueueSend(): void {
    this.queuedInputCountValue++;
    if (this.runningValue) this.phaseValue = HarnessSessionPhase.Queued;
  }

  beginRun(): void {
    this.runningValue = true;
    this.queuedInputCountValue = Math.max(0, this.queuedInputCountValue - 1);
    this.phaseValue = HarnessSessionPhase.Starting;
  }

  completeRun(): void {
    this.phaseValue = HarnessSessionPhase.Completed;
  }

  failRun(error: HarnessErrorShape): void {
    this.lastErrorValue = error;
    this.phaseValue = HarnessSessionPhase.Error;
  }

  finishRun(): void {
    this.runningValue = false;
    if (!this.closedValue && this.phaseValue !== HarnessSessionPhase.Error) {
      this.phaseValue = this.queuedInputCountValue > 0 ? HarnessSessionPhase.Queued : HarnessSessionPhase.Idle;
    }
  }

  close(): void {
    this.closedValue = true;
    this.phaseValue = HarnessSessionPhase.Closed;
  }

  markClosingTurn(): void {
    this.phaseValue = HarnessSessionPhase.ClosingTurn;
  }

  applyRunnerRecord(record: HarnessEventRecord): void {
    this.lastEventAtValue = record.at;
    const payload = payloadObject(record);

    if (record.type === RunStartEvent.type) {
      this.phaseValue = HarnessSessionPhase.Starting;
      this.currentTurnIdValue = undefined;
      this.activeToolValue = undefined;
      this.lastErrorValue = undefined;
    } else if (record.type === ContextReadyEvent.type) {
      this.phaseValue = HarnessSessionPhase.BuildingContext;
    } else if (record.type === ModelBeforeEvent.type) {
      this.phaseValue = HarnessSessionPhase.WaitingModel;
    } else if (record.type === ToolStartEvent.type) {
      this.phaseValue = HarnessSessionPhase.RunningTool;
      this.activeToolValue = {
        id: String(payload.id ?? ""),
        name: String(payload.name ?? ""),
      };
    } else if (record.type === ToolApprovalRequestedEvent.type) {
      this.phaseValue = HarnessSessionPhase.WaitingApproval;
    } else if (record.type === ToolEndEvent.type || record.type === ToolApprovalResolvedEvent.type) {
      this.activeToolValue = undefined;
      this.phaseValue = HarnessSessionPhase.WaitingModel;
    } else if (record.type === TurnEndEvent.type) {
      this.phaseValue = HarnessSessionPhase.ClosingTurn;
      this.currentTurnIdValue = undefined;
    } else if (record.type === RunEndEvent.type) {
      this.phaseValue = HarnessSessionPhase.Completed;
    } else if (record.type === RunFailedEvent.type || record.type === RunAbortedEvent.type) {
      this.phaseValue = HarnessSessionPhase.Error;
      this.lastErrorValue = payload.error as HarnessErrorShape | undefined;
    } else if (record.type === ErrorEvent.type) {
      const error = payload.error as HarnessErrorShape | undefined;
      this.lastErrorValue = error ?? {
        code: "runtime.failed",
        category: "runtime",
        severity: "fatal",
        recoverable: false,
        message: String(payload.message ?? "Unknown error"),
      };
      if (!this.lastErrorValue.recoverable) this.phaseValue = HarnessSessionPhase.Error;
    }

    if (record.turnId) this.currentTurnIdValue = record.turnId;
  }

  snapshot(): SessionStatusSnapshot {
    return {
      running: this.runningValue,
      phase: this.phase,
      queuedInputCount: this.queuedInputCountValue,
      currentTurnId: this.currentTurnIdValue,
      activeTool: this.activeToolValue,
      lastEventAt: this.lastEventAtValue,
      lastError: this.lastErrorValue,
    };
  }
}
