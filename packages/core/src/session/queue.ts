import { eventType } from "../runtime/constructs.js";
import { RunAbortedEvent, RunEndEvent, RunFailedEvent, ToolEndEvent } from "../runtime/events.js";
import type { HarnessEventClass, HarnessEventRecord } from "../runtime/types.js";

export type PendingSendTriggerResult = "none" | "handoff" | "cleared";

export class SessionQueue {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly pendingSendTriggers: string[] = [];

  enqueue<T>(execute: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    const next = previous.then(execute, execute);
    this.queue = next.catch(() => undefined);
    return next;
  }

  addPendingSendTrigger(after?: HarnessEventClass): void {
    this.pendingSendTriggers.push(eventType(after ?? ToolEndEvent));
  }

  applyPendingSendTrigger(record: HarnessEventRecord): PendingSendTriggerResult {
    const targetType = this.pendingSendTriggers[0];
    if (!targetType) return "none";

    if (record.type === targetType) {
      this.pendingSendTriggers.shift();
      return this.isTerminalRunEvent(record.type) ? "cleared" : "handoff";
    }

    if (this.isTerminalRunEvent(record.type)) {
      this.pendingSendTriggers.shift();
      return "cleared";
    }

    return "none";
  }

  private isTerminalRunEvent(type: string): boolean {
    return type === RunEndEvent.type || type === RunFailedEvent.type || type === RunAbortedEvent.type;
  }
}
