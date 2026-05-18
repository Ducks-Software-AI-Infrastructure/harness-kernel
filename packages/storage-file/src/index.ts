import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  HarnessRunStorage,
  HarnessRunStore,
  HarnessSessionStorage,
  type AgentMessage,
  type ContextSnapshot,
  type CreateStoredRunInput,
  type CreateStoredSessionInput,
  type HarnessEventRecord,
  type HarnessSessionSummary,
  type HarnessSnapshot,
  type OpenRunStoreInput,
  type RunCursorState,
  type RunMetrics,
  type SessionListQuery,
  type SessionListResult,
  type StoredRunSummary,
  type TouchStoredSessionInput,
} from "@harness-kernel/core";

function nowIso(): string {
  return new Date().toISOString();
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
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

function sortSessions(items: HarnessSessionSummary[]): HarnessSessionSummary[] {
  return [...items].sort((a, b) => {
    const byLastActive = b.lastActiveAt.localeCompare(a.lastActiveAt);
    return byLastActive || a.sessionId.localeCompare(b.sessionId);
  });
}

function paginateSessions(items: HarnessSessionSummary[], query?: SessionListQuery): SessionListResult {
  const limit = Math.max(1, Math.min(query?.limit ?? 50, 100));
  const cursor = decodeSessionCursor(query?.cursor);
  const filtered = sortSessions(items)
    .filter((summary) => !query?.agentKey || summary.agentKey === query.agentKey)
    .filter((summary) => {
      if (!cursor) return true;
      const [lastActiveAt, sessionId] = cursor;
      return summary.lastActiveAt < lastActiveAt
        || (summary.lastActiveAt === lastActiveAt && summary.sessionId > sessionId);
    });
  const page = filtered.slice(0, limit);
  return {
    items: page,
    nextCursor: filtered.length > limit && page.length > 0 ? encodeSessionCursor(page[page.length - 1]!) : undefined,
  };
}

function ensureRunLayout(runDir: string): void {
  mkdirSync(runDir, { recursive: true });
  mkdirSync(join(runDir, "snapshots"), { recursive: true });
  mkdirSync(join(runDir, "context-snapshots"), { recursive: true });
  const eventLog = join(runDir, "events.jsonl");
  if (!existsSync(eventLog)) writeFileSync(eventLog, "", "utf8");
}

function copyIfExists(from: string, to: string): void {
  if (!existsSync(from)) return;
  if (lstatSync(from).isDirectory()) rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true, force: true });
}

function copyRestorableRunState(fromRunDir: string | undefined, toRunDir: string): void {
  ensureRunLayout(toRunDir);
  if (!fromRunDir || !existsSync(fromRunDir)) return;
  copyIfExists(join(fromRunDir, "events.jsonl"), join(toRunDir, "events.jsonl"));
  copyIfExists(join(fromRunDir, "transcript.json"), join(toRunDir, "transcript.json"));
  copyIfExists(join(fromRunDir, "cursors.json"), join(toRunDir, "cursors.json"));
  copyIfExists(join(fromRunDir, "snapshots"), join(toRunDir, "snapshots"));
  copyIfExists(join(fromRunDir, "context-snapshots"), join(toRunDir, "context-snapshots"));
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
    ensureRunLayout(this.runDir);
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

class FileSessionRunStore extends FileRunStore {
  saveMetrics(_metrics: RunMetrics): void {}
}

export interface FileSessionStorageOptions {
  rootDir?: string;
  sessionsDir?: string;
}

export class FileSessionStorage extends HarnessSessionStorage {
  readonly id = "file-session";
  label = "File Session";
  readonly sessionsDir: string;

  constructor(options: FileSessionStorageOptions = {}) {
    super();
    this.sessionsDir = options.sessionsDir ?? join(options.rootDir ?? ".harness-kernel", "sessions");
  }

  init(): void {
    mkdirSync(this.sessionsDir, { recursive: true });
    if (!existsSync(this.indexPath)) writeJson(this.indexPath, []);
  }

  createSession(input: CreateStoredSessionInput): HarnessSessionSummary {
    this.init();
    const existing = this.getSession(input.sessionId);
    if (existing) return existing;
    const createdAt = input.createdAt ?? nowIso();
    const summary: HarnessSessionSummary = {
      sessionId: input.sessionId,
      agentKey: input.agentKey,
      createdAt,
      lastActiveAt: input.lastActiveAt ?? createdAt,
      mode: input.mode,
      latestRunId: input.latestRunId,
      metadata: input.metadata,
    };
    mkdirSync(this.sessionDir(summary.sessionId), { recursive: true });
    mkdirSync(this.runsDir(summary.sessionId), { recursive: true });
    writeJson(this.sessionPath(summary.sessionId), summary);
    this.writeIndex([...this.readIndex(), summary]);
    return summary;
  }

  getSession(sessionId: string): HarnessSessionSummary | undefined {
    this.init();
    return readJson<HarnessSessionSummary>(this.sessionPath(sessionId));
  }

  listSessions(query?: SessionListQuery): SessionListResult {
    this.init();
    return paginateSessions(this.readIndex(), query);
  }

  touchSession(input: TouchStoredSessionInput): void {
    this.init();
    const summary = this.getSession(input.sessionId);
    if (!summary) return;
    const next: HarnessSessionSummary = {
      ...summary,
      lastActiveAt: input.lastActiveAt ?? nowIso(),
      mode: input.mode ?? summary.mode,
      latestRunId: input.latestRunId ?? summary.latestRunId,
      metadata: input.metadata ?? summary.metadata,
    };
    writeJson(this.sessionPath(input.sessionId), next);
    this.writeIndex(this.readIndex().map((item) => item.sessionId === input.sessionId ? next : item));
  }

  deleteSession(sessionId: string): boolean {
    this.init();
    const existed = existsSync(this.sessionDir(sessionId));
    rmSync(this.sessionDir(sessionId), { recursive: true, force: true });
    this.writeIndex(this.readIndex().filter((item) => item.sessionId !== sessionId));
    return existed;
  }

  createRun(input: CreateStoredRunInput): StoredRunSummary {
    this.init();
    const session = this.getSession(input.sessionId);
    if (!session) throw new Error(`Harness session '${input.sessionId}' was not found.`);
    const existing = this.readRunIndex(input.sessionId).find((run) => run.runId === input.runId);
    if (existing) return existing;

    const run: StoredRunSummary = {
      runId: input.runId,
      sessionId: input.sessionId,
      agentKey: input.agentKey,
      createdAt: input.createdAt ?? nowIso(),
      mode: input.mode,
      outputDir: input.outputDir,
      metadata: input.metadata,
    };
    const previousRunDir = session.latestRunId ? this.runDir(input.sessionId, session.latestRunId) : undefined;
    copyRestorableRunState(previousRunDir, this.runDir(input.sessionId, input.runId));
    writeJson(join(this.runDir(input.sessionId, input.runId), "run.json"), run);
    this.writeRunIndex(input.sessionId, [...this.readRunIndex(input.sessionId), run]);
    this.touchSession({
      sessionId: input.sessionId,
      lastActiveAt: run.createdAt,
      latestRunId: run.runId,
      mode: run.mode,
    });
    return run;
  }

  getLatestRun(sessionId: string): StoredRunSummary | undefined {
    const session = this.getSession(sessionId);
    if (!session?.latestRunId) return undefined;
    return this.readRunIndex(sessionId).find((run) => run.runId === session.latestRunId);
  }

  listRuns(sessionId: string): StoredRunSummary[] {
    return this.readRunIndex(sessionId);
  }

  openRun(input: OpenRunStoreInput): HarnessRunStore {
    return new FileSessionRunStore(this.runsDir(input.sessionId), input.runId);
  }

  private get indexPath(): string {
    return join(this.sessionsDir, "index.json");
  }

  private sessionDir(sessionId: string): string {
    return join(this.sessionsDir, sessionId);
  }

  private sessionPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), "session.json");
  }

  private runsDir(sessionId: string): string {
    return join(this.sessionDir(sessionId), "runs");
  }

  private runDir(sessionId: string, runId: string): string {
    return join(this.runsDir(sessionId), runId);
  }

  private runIndexPath(sessionId: string): string {
    return join(this.runsDir(sessionId), "index.json");
  }

  private readIndex(): HarnessSessionSummary[] {
    return readJson<HarnessSessionSummary[]>(this.indexPath) ?? [];
  }

  private writeIndex(items: HarnessSessionSummary[]): void {
    writeJson(this.indexPath, sortSessions(items));
  }

  private readRunIndex(sessionId: string): StoredRunSummary[] {
    return readJson<StoredRunSummary[]>(this.runIndexPath(sessionId)) ?? [];
  }

  private writeRunIndex(sessionId: string, items: StoredRunSummary[]): void {
    mkdirSync(this.runsDir(sessionId), { recursive: true });
    writeJson(this.runIndexPath(sessionId), items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }
}
