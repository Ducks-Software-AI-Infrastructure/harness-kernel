import { eventType } from "../runtime/constructs.js";
import { RunEndEvent, ToolEndEvent } from "../runtime/events.js";
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
      return record.type === RunEndEvent.type ? "cleared" : "handoff";
    }

    if (record.type === RunEndEvent.type) {
      this.pendingSendTriggers.shift();
      return "cleared";
    }

    return "none";
  }
}
