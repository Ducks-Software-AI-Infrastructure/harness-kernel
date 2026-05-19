import { eventType } from "../runtime/constructs.js";
import {
  MessageDeltaEvent,
  MessageEndEvent,
  ModeChangedEvent,
  RunAbortedEvent,
  RunFailedEvent,
  RunStartEvent,
  ToolApprovalResolvedEvent,
  ToolEndEvent,
  ToolStartEvent,
} from "../runtime/events.js";
import type {
  AgentMessage,
  AgentToolResult,
  HarnessEvent,
  HarnessEventClass,
  HarnessEventRecord,
} from "../runtime/types.js";
import type { HarnessErrorShape, RunMetrics } from "../runtime/types.js";
import type {
  HarnessSessionEventListener,
  HarnessSessionListener,
  HarnessStreamEvent,
  WaitForEventOptions,
} from "./types.js";

function payloadObject(record: HarnessEventRecord): Record<string, unknown> {
  return record.payload && typeof record.payload === "object" ? record.payload as Record<string, unknown> : {};
}

export interface SessionEventHubOptions {
  sessionId: string;
  hydrateApprovalId?(toolCallId: string): string;
}

export class SessionEventHub {
  private readonly listeners = new Set<HarnessSessionListener>();

  constructor(private readonly options: SessionEventHubOptions) {}

  on(listener: HarnessSessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onEvent<TPayload, TEvent extends HarnessEvent<TPayload>>(
    eventClass: HarnessEventClass<TPayload, TEvent>,
    listener: HarnessSessionEventListener<TEvent>,
  ): () => void {
    const targetType = eventType(eventClass);
    return this.on((event) => {
      if (event.type !== "event" || event.event.type !== targetType) return;
      void listener(new eventClass(event.event) as TEvent);
    });
  }

  waitForEvent<TPayload, TEvent extends HarnessEvent<TPayload>>(
    eventClass: HarnessEventClass<TPayload, TEvent>,
    options: WaitForEventOptions = {},
  ): Promise<TEvent> {
    return new Promise((resolve, reject) => {
      let timeout: NodeJS.Timeout | undefined;
      const cleanup = this.onEvent(eventClass, (event) => {
        if (timeout) clearTimeout(timeout);
        cleanup();
        resolve(event);
      });

      if (options.signal) {
        if (options.signal.aborted) {
          cleanup();
          reject(options.signal.reason ?? new Error("waitForEvent aborted."));
          return;
        }
        options.signal.addEventListener("abort", () => {
          if (timeout) clearTimeout(timeout);
          cleanup();
          reject(options.signal?.reason ?? new Error("waitForEvent aborted."));
        }, { once: true });
      }

      if (options.timeoutMs !== undefined) {
        timeout = setTimeout(() => {
          cleanup();
          reject(new Error(`Timed out waiting for event '${eventType(eventClass)}'.`));
        }, options.timeoutMs);
      }
    });
  }

  notify(event: HarnessStreamEvent): void {
    for (const listener of this.listeners) void listener(event);
  }

  notifyRunnerRecord(record: HarnessEventRecord): void {
    for (const event of this.hydrateRuntimeRecord(record)) this.notify(event);
  }

  hydrateRuntimeRecord(record: HarnessEventRecord): HarnessStreamEvent[] {
    const events: HarnessStreamEvent[] = [];
    const payload = payloadObject(record);

    if (record.type === RunStartEvent.type) {
      events.push({
        type: "run.started",
        sessionId: this.options.sessionId,
        runId: record.runId,
        mode: String(payload.modeId ?? record.modeId ?? ""),
      });
    } else if (record.type === RunFailedEvent.type) {
      events.push({
        type: "run.failed",
        runId: record.runId,
        error: payload.error as HarnessErrorShape,
        metrics: payload.metrics as RunMetrics,
      });
    } else if (record.type === RunAbortedEvent.type) {
      events.push({
        type: "run.aborted",
        runId: record.runId,
        error: payload.error as HarnessErrorShape,
        metrics: payload.metrics as RunMetrics,
      });
    } else if (record.type === MessageDeltaEvent.type) {
      events.push({
        type: "assistant.delta",
        text: String(payload.text ?? ""),
        event: record,
      });
    } else if (record.type === MessageEndEvent.type) {
      const message = payload.message as AgentMessage | undefined;
      if (message?.role === "user") events.push({ type: "user.message", message });
      if (message?.role === "assistant") events.push({ type: "assistant.message", message });
    } else if (record.type === ToolStartEvent.type) {
      events.push({
        type: "tool.started",
        toolCallId: String(payload.id ?? ""),
        name: String(payload.name ?? ""),
        args: payload.args,
      });
    } else if (record.type === ToolApprovalResolvedEvent.type) {
      const approvalId = String(payload.id ?? "");
      events.push({
        type: "tool.approval.resolved",
        approvalId: this.options.hydrateApprovalId?.(approvalId) ?? approvalId,
        approved: payload.decision === "approved",
      });
    } else if (record.type === ToolEndEvent.type) {
      events.push({
        type: "tool.ended",
        toolCallId: String(payload.id ?? ""),
        name: String(payload.name ?? ""),
        result: payload.result as AgentToolResult,
      });
    } else if (record.type === ModeChangedEvent.type) {
      events.push({
        type: "mode.changed",
        previousMode: String(payload.previousMode ?? ""),
        mode: String(payload.mode ?? ""),
      });
    }

    events.push({ type: "event", event: record });
    return events;
  }

  clear(): void {
    this.listeners.clear();
  }
}
