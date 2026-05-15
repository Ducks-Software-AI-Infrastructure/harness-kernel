import type {
  AgentMessage,
  ContextSnapshot,
  EventCursor,
  HarnessEventRecord,
  HarnessSnapshot,
  RunMetrics,
  TranscriptBranch,
  TranscriptCursor,
} from "./types.js";

export interface RunCursorState {
  transcriptCursor: TranscriptCursor;
  eventCursor: EventCursor;
  branches?: TranscriptBranch[];
}

export interface OpenRunStoreInput {
  runId: string;
  sessionId: string;
  agentKey: string;
  outputDir?: string;
}

export abstract class HarnessRunStorage {
  abstract readonly id: string;
  label?: string;

  abstract openRun(input: OpenRunStoreInput): Promise<HarnessRunStore> | HarnessRunStore;
}

export abstract class HarnessRunStore {
  abstract readonly runId: string;
  readonly outputDir?: string;
  readonly runDir?: string;

  abstract init(): Promise<void> | void;
  abstract recordEvent(event: HarnessEventRecord): Promise<void> | void;
  abstract loadEvents(): Promise<HarnessEventRecord[]> | HarnessEventRecord[];
  abstract saveTranscript(messages: AgentMessage[]): Promise<void> | void;
  abstract loadTranscript(): Promise<AgentMessage[]> | AgentMessage[];
  abstract saveMetrics(metrics: RunMetrics): Promise<void> | void;
  abstract saveSnapshot(snapshot: HarnessSnapshot): Promise<void> | void;
  abstract loadSnapshots(): Promise<HarnessSnapshot[]> | HarnessSnapshot[];
  abstract deleteSnapshot(id: string): Promise<void> | void;
  abstract saveCursors(cursors: RunCursorState): Promise<void> | void;
  abstract loadCursors(): Promise<RunCursorState | undefined> | RunCursorState | undefined;
  abstract saveContextSnapshot(snapshot: ContextSnapshot): Promise<void> | void;
  abstract loadContextSnapshots(): Promise<ContextSnapshot[]> | ContextSnapshot[];

  close?(): Promise<void>;
}

export class NoopRunStorage extends HarnessRunStorage {
  readonly id = "noop";
  label = "Noop";

  openRun(input: OpenRunStoreInput): HarnessRunStore {
    return new NoopRunStore(input.runId);
  }
}

export class NoopRunStore extends HarnessRunStore {
  readonly outputDir = undefined;
  readonly runDir = undefined;

  constructor(readonly runId: string) {
    super();
  }

  init(): void {}
  recordEvent(_event: HarnessEventRecord): void {}
  loadEvents(): HarnessEventRecord[] { return []; }
  saveTranscript(_messages: AgentMessage[]): void {}
  loadTranscript(): AgentMessage[] { return []; }
  saveMetrics(_metrics: RunMetrics): void {}
  saveSnapshot(_snapshot: HarnessSnapshot): void {}
  loadSnapshots(): HarnessSnapshot[] { return []; }
  deleteSnapshot(_id: string): void {}
  saveCursors(_cursors: RunCursorState): void {}
  loadCursors(): RunCursorState | undefined { return undefined; }
  saveContextSnapshot(_snapshot: ContextSnapshot): void {}
  loadContextSnapshots(): ContextSnapshot[] { return []; }
}

function cloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface MemoryRunState {
  events: HarnessEventRecord[];
  transcript: AgentMessage[];
  metrics?: RunMetrics;
  snapshots: Map<string, HarnessSnapshot>;
  cursors?: RunCursorState;
  contextSnapshots: Map<string, ContextSnapshot>;
}

export class MemoryRunStorage extends HarnessRunStorage {
  readonly id = "memory";
  label = "Memory";
  private readonly runs = new Map<string, MemoryRunState>();

  openRun(input: OpenRunStoreInput): HarnessRunStore {
    let state = this.runs.get(input.runId);
    if (!state) {
      state = {
        events: [],
        transcript: [],
        snapshots: new Map(),
        contextSnapshots: new Map(),
      };
      this.runs.set(input.runId, state);
    }
    return new MemoryRunStore(input.runId, state);
  }
}

export class MemoryRunStore extends HarnessRunStore {
  readonly outputDir = undefined;
  readonly runDir = undefined;

  constructor(
    readonly runId: string,
    private readonly state: MemoryRunState,
  ) {
    super();
  }

  init(): void {}
  recordEvent(event: HarnessEventRecord): void { this.state.events.push(cloneJSON(event)); }
  loadEvents(): HarnessEventRecord[] { return cloneJSON(this.state.events); }
  saveTranscript(messages: AgentMessage[]): void { this.state.transcript = cloneJSON(messages); }
  loadTranscript(): AgentMessage[] { return cloneJSON(this.state.transcript); }
  saveMetrics(metrics: RunMetrics): void { this.state.metrics = cloneJSON(metrics); }
  saveSnapshot(snapshot: HarnessSnapshot): void { this.state.snapshots.set(snapshot.id, cloneJSON(snapshot)); }
  loadSnapshots(): HarnessSnapshot[] {
    return [...this.state.snapshots.values()]
      .map((snapshot) => cloneJSON(snapshot))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  deleteSnapshot(id: string): void { this.state.snapshots.delete(id); }
  saveCursors(cursors: RunCursorState): void { this.state.cursors = cloneJSON(cursors); }
  loadCursors(): RunCursorState | undefined { return this.state.cursors ? cloneJSON(this.state.cursors) : undefined; }
  saveContextSnapshot(snapshot: ContextSnapshot): void { this.state.contextSnapshots.set(snapshot.id, cloneJSON(snapshot)); }
  loadContextSnapshots(): ContextSnapshot[] {
    return [...this.state.contextSnapshots.values()]
      .map((snapshot) => cloneJSON(snapshot))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
