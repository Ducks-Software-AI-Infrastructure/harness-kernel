import type { AgentSharedState } from "./shared-state.js";
import type { ContextEntry, ContextSnapshot } from "./context.js";
import type { EventCursor } from "./events.js";
import type { JsonObject } from "./json.js";
import type { TranscriptBranch, TranscriptCursor } from "./messages.js";

export interface HarnessSnapshotInput {
  label?: string;
  metadata?: JsonObject;
}

export interface HarnessSnapshotSummary {
  id: string;
  label?: string;
  createdAt: string;
  agentKey: string;
  runId?: string;
  turnId?: string;
  modeId: string;
  model: string;
  transcriptCursor: TranscriptCursor;
  eventCursor: EventCursor;
  metadata?: JsonObject;
}

export interface HarnessSnapshot extends HarnessSnapshotSummary {
  state: AgentSharedState;
  contextEntries: ContextEntry[];
  contextSnapshot?: ContextSnapshot;
  branches: TranscriptBranch[];
}

export interface HarnessSnapshotCreator {
  create(input?: HarnessSnapshotInput): Promise<HarnessSnapshot>;
}

export interface HarnessSnapshotSession extends HarnessSnapshotCreator {
  list(): HarnessSnapshotSummary[];
  get(id: string): HarnessSnapshot | undefined;
  restore(id: string): Promise<HarnessSnapshot>;
  delete(id: string): Promise<boolean>;
}
