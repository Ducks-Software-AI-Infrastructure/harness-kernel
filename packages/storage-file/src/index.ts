import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  HarnessRunStorage,
  HarnessRunStore,
  type AgentMessage,
  type ContextSnapshot,
  type EventCursor,
  type HarnessEventRecord,
  type HarnessSnapshot,
  type OpenRunStoreInput,
  type RunCursorState,
  type RunMetrics,
  type TranscriptBranch,
  type TranscriptCursor,
} from "@harness-kernel/core";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

interface FileRunCursorState {
  transcriptCursor: TranscriptCursor;
  eventCursor: EventCursor;
  branches?: TranscriptBranch[];
}

export interface FileRunStorageOptions {
  outputDir?: string;
}

export class FileRunStorage extends HarnessRunStorage {
  readonly id = "file";
  label = "File";
  readonly outputDir: string;

  constructor(options: FileRunStorageOptions = {}) {
    super();
    this.outputDir = options.outputDir ?? ".harness-kernel/runs";
  }

  openRun(input: OpenRunStoreInput): HarnessRunStore {
    return new FileRunStore(input.outputDir ?? this.outputDir, input.runId);
  }
}

export class FileRunStore extends HarnessRunStore {
  readonly runDir: string;

  constructor(
    readonly outputDir: string,
    readonly runId: string,
  ) {
    super();
    this.runDir = join(outputDir, runId);
  }

  init(): void {
    mkdirSync(this.runDir, { recursive: true });
    mkdirSync(join(this.runDir, "snapshots"), { recursive: true });
    mkdirSync(join(this.runDir, "context-snapshots"), { recursive: true });
    const eventLog = join(this.runDir, "events.jsonl");
    if (!existsSync(eventLog)) writeFileSync(eventLog, "", "utf8");
  }

  recordEvent(event: HarnessEventRecord): void {
    appendFileSync(join(this.runDir, "events.jsonl"), `${JSON.stringify(event)}\n`);
  }

  loadEvents(): HarnessEventRecord[] {
    const path = join(this.runDir, "events.jsonl");
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as HarnessEventRecord);
  }

  saveTranscript(messages: AgentMessage[]): void {
    writeJson(join(this.runDir, "transcript.json"), messages);
  }

  loadTranscript(): AgentMessage[] {
    return readJson<AgentMessage[]>(join(this.runDir, "transcript.json")) ?? [];
  }

  saveMetrics(metrics: RunMetrics): void {
    writeJson(join(this.runDir, "metrics.json"), metrics);
  }

  saveSnapshot(snapshot: HarnessSnapshot): void {
    writeJson(join(this.runDir, "snapshots", `${snapshot.id}.json`), snapshot);
  }

  loadSnapshots(): HarnessSnapshot[] {
    const snapshotDir = join(this.runDir, "snapshots");
    if (!existsSync(snapshotDir)) return [];
    return readdirSync(snapshotDir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => readJson<HarnessSnapshot>(join(snapshotDir, entry)))
      .filter((snapshot): snapshot is HarnessSnapshot => Boolean(snapshot))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  deleteSnapshot(id: string): void {
    rmSync(join(this.runDir, "snapshots", `${id}.json`), { force: true });
  }

  saveCursors(cursors: RunCursorState): void {
    writeJson(join(this.runDir, "cursors.json"), cursors);
  }

  loadCursors(): RunCursorState | undefined {
    return readJson<RunCursorState>(join(this.runDir, "cursors.json"));
  }

  saveContextSnapshot(snapshot: ContextSnapshot): void {
    writeJson(join(this.runDir, "context-snapshots", `${snapshot.id}.json`), snapshot);
  }

  loadContextSnapshots(): ContextSnapshot[] {
    const snapshotDir = join(this.runDir, "context-snapshots");
    if (!existsSync(snapshotDir)) return [];
    return readdirSync(snapshotDir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => readJson<ContextSnapshot>(join(snapshotDir, entry)))
      .filter((snapshot): snapshot is ContextSnapshot => Boolean(snapshot))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
