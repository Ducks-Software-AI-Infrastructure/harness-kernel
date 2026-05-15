import { randomId } from "./id.js";
import type { HarnessEventEmitOptions, HarnessSnapshot, HarnessSnapshotInput, HarnessSnapshotSummary } from "./types.js";

function cloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type SnapshotRuntimeState = Omit<HarnessSnapshot, "id" | "label" | "createdAt" | "metadata">;

export interface SnapshotManagerInput {
  now(): string;
  ensureStoreInitialized(): Promise<void>;
  readState(): SnapshotRuntimeState;
  restoreState(snapshot: HarnessSnapshot): void;
  persistCursors(): Promise<void>;
  saveSnapshot(snapshot: HarnessSnapshot): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;
  emitCreated(summary: HarnessSnapshotSummary, options?: HarnessEventEmitOptions): Promise<void>;
  emitRestored(summary: HarnessSnapshotSummary, options?: HarnessEventEmitOptions): Promise<void>;
  emitDeleted(summary: HarnessSnapshotSummary, options?: HarnessEventEmitOptions): Promise<void>;
  logCreated(summary: HarnessSnapshotSummary, options?: HarnessEventEmitOptions): void;
  logRestored(summary: HarnessSnapshotSummary, options?: HarnessEventEmitOptions): void;
  logDeleted(summary: HarnessSnapshotSummary, options?: HarnessEventEmitOptions): void;
  logRestoreRejected(snapshotId: string, reason: string, options?: HarnessEventEmitOptions): void;
}

export class SnapshotManager {
  private snapshots: HarnessSnapshot[] = [];

  constructor(private readonly input?: SnapshotManagerInput) {}

  load(snapshot: HarnessSnapshot): void {
    if (!this.snapshots.some((candidate) => candidate.id === snapshot.id)) {
      this.snapshots.push(cloneJSON(snapshot));
    }
  }

  add(snapshot: HarnessSnapshot): void {
    this.snapshots.push(snapshot);
  }

  get(id: string): HarnessSnapshot | undefined {
    const snapshot = this.snapshots.find((candidate) => candidate.id === id);
    return snapshot ? cloneJSON(snapshot) : undefined;
  }

  getRaw(id: string): HarnessSnapshot | undefined {
    return this.snapshots.find((candidate) => candidate.id === id);
  }

  async create(
    input: HarnessSnapshotInput = {},
    eventOptions?: HarnessEventEmitOptions,
  ): Promise<HarnessSnapshot> {
    const manager = this.requireInput();
    await manager.ensureStoreInitialized();
    const snapshot: HarnessSnapshot = {
      id: randomId(),
      label: input.label,
      createdAt: manager.now(),
      ...cloneJSON(manager.readState()),
      metadata: input.metadata,
    };

    this.add(snapshot);
    await manager.saveSnapshot(snapshot);
    const summary = this.summary(snapshot);
    await manager.emitCreated(summary, eventOptions);
    manager.logCreated(summary, eventOptions);
    return cloneJSON(snapshot);
  }

  async restore(id: string, eventOptions?: HarnessEventEmitOptions): Promise<HarnessSnapshot> {
    const manager = this.requireInput();
    await manager.ensureStoreInitialized();
    const snapshot = this.getRaw(id);
    if (!snapshot) {
      manager.logRestoreRejected(id, "not_found", eventOptions);
      throw new Error(`Snapshot '${id}' was not found.`);
    }

    manager.restoreState(snapshot);
    const summary = this.summary(snapshot);
    await manager.emitRestored(summary, eventOptions);
    manager.logRestored(summary, eventOptions);
    await manager.persistCursors();
    return cloneJSON(snapshot);
  }

  list(): HarnessSnapshotSummary[] {
    return cloneJSON(this.snapshots.map((snapshot) => this.summary(snapshot)));
  }

  delete(id: string): HarnessSnapshot | undefined {
    const snapshot = this.snapshots.find((candidate) => candidate.id === id);
    if (!snapshot) return undefined;
    this.snapshots = this.snapshots.filter((candidate) => candidate.id !== id);
    return snapshot;
  }

  async deletePersisted(id: string, eventOptions?: HarnessEventEmitOptions): Promise<boolean> {
    const manager = this.requireInput();
    await manager.ensureStoreInitialized();
    const snapshot = this.delete(id);
    if (!snapshot) return false;
    await manager.deleteSnapshot(id);
    const summary = this.summary(snapshot);
    await manager.emitDeleted(summary, eventOptions);
    manager.logDeleted(summary, eventOptions);
    return true;
  }

  summary(snapshot: HarnessSnapshot): HarnessSnapshotSummary {
    return {
      id: snapshot.id,
      label: snapshot.label,
      createdAt: snapshot.createdAt,
      agentKey: snapshot.agentKey,
      runId: snapshot.runId,
      turnId: snapshot.turnId,
      modeId: snapshot.modeId,
      model: snapshot.model,
      transcriptCursor: cloneJSON(snapshot.transcriptCursor),
      eventCursor: cloneJSON(snapshot.eventCursor),
      metadata: snapshot.metadata,
    };
  }

  private requireInput(): SnapshotManagerInput {
    if (!this.input) throw new Error("SnapshotManager operation requires runtime dependencies.");
    return this.input;
  }
}
