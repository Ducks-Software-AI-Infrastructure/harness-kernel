import type { JsonObject } from "./json.js";

export interface HarnessEventMetadata extends JsonObject {
  label?: string;
}

export interface HarnessEventSource {
  kind: "runtime" | "model_provider" | "tool" | "hook" | "context_provider" | "mode" | "user" | "custom";
  id?: string;
  name?: string;
}

export interface HarnessEventRecord<TPayload = unknown> {
  id: string;
  seq: number;
  branchId: string;
  type: string;
  eventClassId: string;
  at: string;
  source: HarnessEventSource;
  payload: TPayload;
  runId: string;
  turnId?: string;
  modeId?: string;
  correlationId?: string;
  causationId?: string;
  hidden: true;
  metadata?: HarnessEventMetadata;
}

export abstract class HarnessEvent<TPayload = unknown> {
  static type?: string;
  static schema?: unknown;

  constructor(readonly record: HarnessEventRecord<TPayload>) {}

  get id(): string {
    return this.record.id;
  }

  get type(): string {
    return this.record.type;
  }

  get payload(): TPayload {
    return this.record.payload;
  }

  get at(): string {
    return this.record.at;
  }
}

export type HarnessEventClass<
  TPayload = unknown,
  TEvent extends HarnessEvent<TPayload> = HarnessEvent<TPayload>,
> = {
  readonly type?: string;
  readonly schema?: unknown;
  new (record: HarnessEventRecord<any>): TEvent;
};

export interface HarnessEventEmitOptions {
  source?: HarnessEventSource;
  correlationId?: string;
  causationId?: string;
  metadata?: HarnessEventMetadata;
  hiddenTranscript?: boolean;
  skipHooks?: boolean;
}

export interface HarnessEventQuery<TPayload = unknown> {
  event?: HarnessEventClass<TPayload>;
  type?: string;
  sourceKind?: HarnessEventSource["kind"];
  limit?: number;
  since?: string;
  until?: string;
  includeInactive?: boolean;
}

export interface EventCursor {
  id: string;
  branchId: string;
  headEventId?: string;
  seq: number;
  updatedAt: string;
}

export type RunnerEventListener = (event: HarnessEventRecord) => void | Promise<void>;
