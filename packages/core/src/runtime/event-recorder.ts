import { randomId } from "./id.js";
import { eventType } from "./constructs.js";
import { HarnessEvent, type HarnessEventClass, type HarnessEventQuery, type HarnessEventRecord, type HarnessEventSource, type RunnerEventListener } from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

class RehydratedHarnessEvent<TPayload = unknown> extends HarnessEvent<TPayload> {}

export class EventRecorder {
  private events: HarnessEvent[] = [];
  private eventSeq = 0;
  private readonly listeners = new Set<RunnerEventListener>();

  get count(): number {
    return this.events.length;
  }

  subscribe(listener: RunnerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  load(records: HarnessEventRecord[]): void {
    if (records.length === 0) return;
    this.events = records.map((record) => new RehydratedHarnessEvent(record));
    this.eventSeq = Math.max(0, ...records.map((event) => event.seq));
  }

  has(id: string): boolean {
    return this.events.some((event) => event.id === id);
  }

  latestForBranch(branchId: string): HarnessEvent | undefined {
    let latest: HarnessEvent | undefined;
    for (const event of this.events) {
      if (event.record.branchId !== branchId) continue;
      if (!latest || event.record.seq > latest.record.seq) latest = event;
    }
    return latest;
  }

  record(input: {
    eventClass: HarnessEventClass;
    type: string;
    payload: unknown;
    branchId: string;
    source: HarnessEventSource;
    runId: string;
    turnId?: string;
    modeId: string;
    correlationId?: string;
    causationId?: string;
    metadata?: Record<string, unknown>;
  }): HarnessEvent {
    const record: HarnessEventRecord = {
      id: randomId(),
      seq: ++this.eventSeq,
      branchId: input.branchId,
      type: input.type,
      eventClassId: input.type,
      at: nowIso(),
      source: input.source,
      payload: input.payload,
      runId: input.runId,
      turnId: input.turnId,
      modeId: input.modeId,
      correlationId: input.correlationId,
      causationId: input.causationId,
      hidden: true,
      metadata: input.metadata,
    };

    const event = new input.eventClass(record);
    this.events.push(event);
    return event;
  }

  query<TPayload = unknown>(
    filter: HarnessEventQuery<TPayload> | undefined,
    activeSegments: Map<string, number>,
  ): HarnessEvent<TPayload>[] {
    let events = this.events as HarnessEvent<TPayload>[];
    if (!filter?.includeInactive) {
      events = events.filter((event) => {
        const maxSeq = activeSegments.get(event.record.branchId);
        return maxSeq !== undefined && event.record.seq <= maxSeq;
      });
    }
    if (filter?.event) events = events.filter((event) => event.type === eventType(filter.event!));
    if (filter?.type) events = events.filter((event) => event.type === filter.type);
    if (filter?.sourceKind) events = events.filter((event) => event.record.source.kind === filter.sourceKind);
    if (filter?.since) events = events.filter((event) => event.at >= filter.since!);
    if (filter?.until) events = events.filter((event) => event.at <= filter.until!);
    if (typeof filter?.limit === "number" && filter.limit > 0) events = events.slice(-filter.limit);
    return events;
  }

  async notify(record: HarnessEventRecord): Promise<void> {
    for (const listener of this.listeners) await listener(record);
  }
}
