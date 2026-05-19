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
import { HarnessSessionStorage } from "./storage.js";
import type { HarnessRunStore, HarnessRunStorage, RunCursorState } from "./storage.js";

export interface StoredRuntimeState {
  snapshots: HarnessSnapshot[];
  contextSnapshots: ContextSnapshot[];
  transcript: AgentMessage[];
  events: HarnessEventRecord[];
  cursors?: RunCursorState;
}

export class RunStorageCoordinator {
  private runIdValue: string;
  private store: HarnessRunStore | undefined;
  private storePromise: Promise<HarnessRunStore> | undefined;
  private initialized = false;
  private runtimeLoaded = false;
  private createRunOnOpen: boolean;

  constructor(
    private readonly input: {
      storage: HarnessRunStorage | HarnessSessionStorage;
      runId: string;
      sessionId: string;
      agentKey: string;
      outputDir?: string;
      mode(): string;
      openExistingRun?: boolean;
      logOpened(fields: { storageId: string; runId: string; runDir?: string }): void;
      logFailed(fields: { operation: string; error: unknown }): void;
    },
  ) {
    this.runIdValue = input.runId;
    this.createRunOnOpen = !input.openExistingRun;
  }

  get runDir(): string | undefined {
    return this.store?.runDir;
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.write("init", (store) => store.init());
    this.initialized = true;
  }

  async loadRuntimeState(): Promise<StoredRuntimeState | undefined> {
    if (this.runtimeLoaded) return undefined;
    this.runtimeLoaded = true;

    return {
      snapshots: await this.write("load_snapshots", (store) => store.loadSnapshots()),
      contextSnapshots: await this.write("load_context_snapshots", (store) => store.loadContextSnapshots()),
      transcript: await this.write("load_transcript", (store) => store.loadTranscript()),
      events: await this.write("load_events", (store) => store.loadEvents()),
      cursors: await this.write("load_cursors", (store) => store.loadCursors()),
    };
  }

  async saveTranscript(messages: AgentMessage[]): Promise<void> {
    await this.write("save_transcript", (store) => store.saveTranscript(messages));
  }

  async saveMetrics(metrics: RunMetrics): Promise<void> {
    await this.write("save_metrics", (store) => store.saveMetrics(metrics));
  }

  async saveSnapshot(snapshot: HarnessSnapshot): Promise<void> {
    await this.write("save_snapshot", (store) => store.saveSnapshot(snapshot));
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.write("delete_snapshot", (store) => store.deleteSnapshot(id));
  }

  async saveContextSnapshot(snapshot: ContextSnapshot): Promise<void> {
    await this.write("save_context_snapshot", (store) => store.saveContextSnapshot(snapshot));
  }

  async recordEvent(event: HarnessEventRecord): Promise<void> {
    await this.write("record_event", (store) => store.recordEvent(event));
  }

  async saveCursors(cursors: {
    transcriptCursor: TranscriptCursor;
    eventCursor: EventCursor;
    branches: TranscriptBranch[];
  }): Promise<void> {
    await this.write("save_cursors", (store) => store.saveCursors(cursors));
  }

  async beginRun(runId: string): Promise<void> {
    await this.close();
    this.runIdValue = runId;
    this.store = undefined;
    this.storePromise = undefined;
    this.initialized = false;
    this.runtimeLoaded = false;
    this.createRunOnOpen = true;
  }

  async close(): Promise<void> {
    const store = this.store ?? (this.storePromise ? await this.storePromise : undefined);
    await store?.close?.();
  }

  private async createStore(runId: string): Promise<HarnessRunStore> {
    try {
      if (this.input.storage instanceof HarnessSessionStorage && this.createRunOnOpen) {
        await this.input.storage.createRun({
          runId,
          sessionId: this.input.sessionId,
          agentKey: this.input.agentKey,
          outputDir: this.input.outputDir,
          mode: this.input.mode(),
        });
      }
      this.createRunOnOpen = false;
      const store = await this.input.storage.openRun({
        runId,
        sessionId: this.input.sessionId,
        agentKey: this.input.agentKey,
        outputDir: this.input.outputDir,
      });
      this.input.logOpened({ storageId: this.input.storage.id, runId, runDir: store.runDir });
      return store;
    } catch (error) {
      this.input.logFailed({ operation: "open_run", error });
      throw error;
    }
  }

  private async getStore(): Promise<HarnessRunStore> {
    if (this.store) return this.store;
    this.storePromise ??= this.createStore(this.runIdValue);
    this.store = await this.storePromise;
    return this.store;
  }

  private async write<T>(
    operation: string,
    write: (store: HarnessRunStore) => T | Promise<T>,
  ): Promise<T> {
    try {
      return await write(await this.getStore());
    } catch (error) {
      this.input.logFailed({ operation, error });
      throw error;
    }
  }
}
