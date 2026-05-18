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

export interface HarnessSessionSummary {
  sessionId: string;
  agentKey: string;
  createdAt: string;
  lastActiveAt: string;
  mode: string;
  latestRunId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionListQuery {
  agentKey?: string;
  active?: boolean;
  limit?: number;
  cursor?: string;
}

export interface SessionListResult {
  items: HarnessSessionSummary[];
  nextCursor?: string;
}

export interface StoredRunSummary {
  runId: string;
  sessionId: string;
  agentKey: string;
  createdAt: string;
  mode: string;
  outputDir?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateStoredSessionInput {
  sessionId: string;
  agentKey: string;
  createdAt?: string;
  lastActiveAt?: string;
  mode: string;
  latestRunId?: string;
  metadata?: Record<string, unknown>;
}

export interface TouchStoredSessionInput {
  sessionId: string;
  lastActiveAt?: string;
  mode?: string;
  latestRunId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateStoredRunInput {
  runId: string;
  sessionId: string;
  agentKey: string;
  createdAt?: string;
  mode: string;
  outputDir?: string;
  metadata?: Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function encodeSessionCursor(summary: HarnessSessionSummary): string {
  return Buffer.from(JSON.stringify([summary.lastActiveAt, summary.sessionId]), "utf8").toString("base64url");
}

function decodeSessionCursor(cursor: string | undefined): [string, string] | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || typeof parsed[0] !== "string" || typeof parsed[1] !== "string") return undefined;
    return [parsed[0], parsed[1]];
  } catch {
    return undefined;
  }
}

function sortSessionSummaries(summaries: HarnessSessionSummary[]): HarnessSessionSummary[] {
  return [...summaries].sort((a, b) => {
    const byLastActive = b.lastActiveAt.localeCompare(a.lastActiveAt);
    return byLastActive || a.sessionId.localeCompare(b.sessionId);
  });
}

function paginateSessionSummaries(
  summaries: HarnessSessionSummary[],
  query: SessionListQuery | undefined,
): SessionListResult {
  const limit = Math.max(1, Math.min(query?.limit ?? 50, 100));
  const cursor = decodeSessionCursor(query?.cursor);
  const filtered = sortSessionSummaries(summaries)
    .filter((summary) => !query?.agentKey || summary.agentKey === query.agentKey)
    .filter((summary) => {
      if (!cursor) return true;
      const [lastActiveAt, sessionId] = cursor;
      return summary.lastActiveAt < lastActiveAt
        || (summary.lastActiveAt === lastActiveAt && summary.sessionId > sessionId);
    });
  const items = filtered.slice(0, limit);
  const nextCursor = filtered.length > limit && items.length > 0
    ? encodeSessionCursor(items[items.length - 1]!)
    : undefined;
  return { items: items.map((item) => cloneJSON(item)), nextCursor };
}

export abstract class HarnessRunStorage {
  abstract readonly id: string;
  label?: string;

  abstract openRun(input: OpenRunStoreInput): Promise<HarnessRunStore> | HarnessRunStore;
}

export abstract class HarnessSessionStorage {
  abstract readonly id: string;
  label?: string;

  init?(): Promise<void> | void;
  abstract createSession(input: CreateStoredSessionInput): Promise<HarnessSessionSummary> | HarnessSessionSummary;
  abstract getSession(sessionId: string): Promise<HarnessSessionSummary | undefined> | HarnessSessionSummary | undefined;
  abstract listSessions(query?: SessionListQuery): Promise<SessionListResult> | SessionListResult;
  abstract touchSession(input: TouchStoredSessionInput): Promise<void> | void;
  abstract deleteSession(sessionId: string): Promise<boolean> | boolean;
  abstract createRun(input: CreateStoredRunInput): Promise<StoredRunSummary> | StoredRunSummary;
  abstract getLatestRun(sessionId: string): Promise<StoredRunSummary | undefined> | StoredRunSummary | undefined;
  abstract listRuns(sessionId: string): Promise<StoredRunSummary[]> | StoredRunSummary[];
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

interface MemoryStoredSession {
  summary: HarnessSessionSummary;
  runs: StoredRunSummary[];
}

export class MemorySessionStorage extends HarnessSessionStorage {
  readonly id = "memory-session";
  label = "Memory Session";
  private readonly sessions = new Map<string, MemoryStoredSession>();
  private readonly runStates = new Map<string, MemoryRunState>();

  createSession(input: CreateStoredSessionInput): HarnessSessionSummary {
    const existing = this.sessions.get(input.sessionId)?.summary;
    if (existing) return cloneJSON(existing);
    const createdAt = input.createdAt ?? nowIso();
    const summary: HarnessSessionSummary = {
      sessionId: input.sessionId,
      agentKey: input.agentKey,
      createdAt,
      lastActiveAt: input.lastActiveAt ?? createdAt,
      mode: input.mode,
      latestRunId: input.latestRunId,
      metadata: input.metadata ? cloneJSON(input.metadata) : undefined,
    };
    this.sessions.set(summary.sessionId, { summary, runs: [] });
    return cloneJSON(summary);
  }

  getSession(sessionId: string): HarnessSessionSummary | undefined {
    const summary = this.sessions.get(sessionId)?.summary;
    return summary ? cloneJSON(summary) : undefined;
  }

  listSessions(query?: SessionListQuery): SessionListResult {
    return paginateSessionSummaries([...this.sessions.values()].map((entry) => entry.summary), query);
  }

  touchSession(input: TouchStoredSessionInput): void {
    const entry = this.sessions.get(input.sessionId);
    if (!entry) return;
    entry.summary = {
      ...entry.summary,
      lastActiveAt: input.lastActiveAt ?? nowIso(),
      mode: input.mode ?? entry.summary.mode,
      latestRunId: input.latestRunId ?? entry.summary.latestRunId,
      metadata: input.metadata ? cloneJSON(input.metadata) : entry.summary.metadata,
    };
  }

  deleteSession(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    this.sessions.delete(sessionId);
    for (const run of entry.runs) this.runStates.delete(run.runId);
    return true;
  }

  createRun(input: CreateStoredRunInput): StoredRunSummary {
    const entry = this.sessions.get(input.sessionId);
    if (!entry) throw new Error(`Harness session '${input.sessionId}' was not found.`);
    const existing = entry.runs.find((run) => run.runId === input.runId);
    if (existing) return cloneJSON(existing);
    const latestRun = entry.summary.latestRunId;
    const previousState = latestRun ? this.runStates.get(latestRun) : undefined;
    const state = previousState ? cloneRunState(previousState) : createMemoryRunState();
    this.runStates.set(input.runId, state);
    const run: StoredRunSummary = {
      runId: input.runId,
      sessionId: input.sessionId,
      agentKey: input.agentKey,
      createdAt: input.createdAt ?? nowIso(),
      mode: input.mode,
      outputDir: input.outputDir,
      metadata: input.metadata ? cloneJSON(input.metadata) : undefined,
    };
    entry.runs.push(run);
    entry.summary = {
      ...entry.summary,
      latestRunId: run.runId,
      lastActiveAt: run.createdAt,
      mode: run.mode,
    };
    return cloneJSON(run);
  }

  getLatestRun(sessionId: string): StoredRunSummary | undefined {
    const entry = this.sessions.get(sessionId);
    const latestRunId = entry?.summary.latestRunId;
    if (!entry || !latestRunId) return undefined;
    const run = entry.runs.find((candidate) => candidate.runId === latestRunId);
    return run ? cloneJSON(run) : undefined;
  }

  listRuns(sessionId: string): StoredRunSummary[] {
    return (this.sessions.get(sessionId)?.runs ?? []).map((run) => cloneJSON(run));
  }

  openRun(input: OpenRunStoreInput): HarnessRunStore {
    let state = this.runStates.get(input.runId);
    if (!state) {
      state = createMemoryRunState();
      this.runStates.set(input.runId, state);
    }
    return new MemoryRunStore(input.runId, state);
  }
}

function createMemoryRunState(): MemoryRunState {
  return {
    events: [],
    transcript: [],
    snapshots: new Map(),
    contextSnapshots: new Map(),
  };
}

function cloneRunState(state: MemoryRunState): MemoryRunState {
  return {
    events: cloneJSON(state.events),
    transcript: cloneJSON(state.transcript),
    metrics: state.metrics ? cloneJSON(state.metrics) : undefined,
    snapshots: new Map([...state.snapshots.entries()].map(([id, snapshot]) => [id, cloneJSON(snapshot)])),
    cursors: state.cursors ? cloneJSON(state.cursors) : undefined,
    contextSnapshots: new Map([...state.contextSnapshots.entries()].map(([id, snapshot]) => [id, cloneJSON(snapshot)])),
  };
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
